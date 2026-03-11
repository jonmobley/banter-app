import Foundation
import Capacitor
import AVFoundation
import CoreBluetooth
import flic2lib

@objc(PushToTalkPlugin)
public class PushToTalkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PushToTalkPlugin"
    public let jsName = "PushToTalk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "joinChannel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leaveChannel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBeginTransmitting", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTransmitting", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveRemoteParticipant", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableHardwarePTT", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableHardwarePTT", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanForFlicButtons", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScanForFlicButtons", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFlicButtons", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetFlicButton", returnType: CAPPluginReturnPromise),
    ]

    private var hardwarePTTEnabled = false
    private var isTransmitting = false
    private var flicManagerInitialized = false
    private var flicManagerState: FLICManagerState = .unknown

    private var wasTransmittingBeforeInterruption = false

    override public func load() {
        super.load()
        observeAudioInterruptions()
        initializeFlicManager()
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        FLICManager.shared()?.stopScan()
    }

    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
            )
            try audioSession.setActive(true)
        } catch {
            print("PushToTalk: Failed to configure audio session: \(error)")
        }
    }

    // MARK: - Audio Session Interruption Handling (phone calls, Siri, alarms)

    private func observeAudioInterruptions() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioInterruption),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func handleAudioInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            print("PushToTalk: Audio interrupted (phone call, Siri, etc.)")
            wasTransmittingBeforeInterruption = isTransmitting
            if isTransmitting {
                isTransmitting = false
                notifyListeners("hardwarePTTReleased", data: [:])
            }
            notifyListeners("audioInterrupted", data: ["reason": "began"])

        case .ended:
            print("PushToTalk: Audio interruption ended")
            let options = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)

            if shouldResume {
                do {
                    try AVAudioSession.sharedInstance().setActive(true)
                    print("PushToTalk: Audio session reactivated after interruption")
                } catch {
                    print("PushToTalk: Failed to reactivate audio session: \(error)")
                }
            }
            notifyListeners("audioResumed", data: ["shouldResume": shouldResume])

        @unknown default:
            break
        }
    }

    @objc private func handleAudioRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        switch reason {
        case .oldDeviceUnavailable:
            print("PushToTalk: Audio device disconnected (headphones unplugged, etc.)")
            notifyListeners("audioRouteChanged", data: ["reason": "deviceUnavailable"])
        case .newDeviceAvailable:
            print("PushToTalk: New audio device connected")
            notifyListeners("audioRouteChanged", data: ["reason": "newDevice"])
        default:
            break
        }
    }

    // MARK: - Flic 2 Integration
    //
    // The Flic 2 SDK (flic2lib) must be manually added to the Xcode project:
    // 1. Download flic2lib.xcframework from https://github.com/50ButtonsEach/flic2lib-ios
    // 2. Drag it into Frameworks, Libraries, and Embedded Content (Embed & Sign)
    // 3. In Build Settings, set "Allow Non-modular includes in Framework Modules" to Yes
    // 4. Enable "Uses Bluetooth LE accessories" in Background Modes (Signing & Capabilities)
    //
    // No developer portal registration needed — the SDK is free and open.
    // Once flic2lib is available, uncomment the Flic integration code below.
    // Button events feed into the same hardwarePTTPressed/hardwarePTTReleased
    // pipeline that wired PTT accessories use.

    private func initializeFlicManager() {
        FLICManager.configure(with: self, buttonDelegate: self, background: true)
        flicManagerInitialized = true
        print("PushToTalk: Flic manager initialized")
    }

    @objc func scanForFlicButtons(_ call: CAPPluginCall) {
        print("[Flic] scanForFlicButtons called, managerInitialized=\(flicManagerInitialized), btState=\(flicManagerState.rawValue)")
        guard flicManagerInitialized else {
            print("[Flic] REJECTED: manager not initialized")
            call.reject("Flic manager not initialized")
            return
        }
        guard flicManagerState == .poweredOn else {
            let reason: String
            switch flicManagerState {
            case .poweredOff: reason = "Bluetooth is turned off"
            case .unauthorized: reason = "Bluetooth permission not granted"
            case .unsupported: reason = "Bluetooth LE not supported"
            default: reason = "Bluetooth not ready"
            }
            print("[Flic] REJECTED: \(reason)")
            call.reject(reason)
            return
        }
        print("[Flic] Starting native scan...")
        FLICManager.shared()?.scanForButtons(stateChangeHandler: { state in
            var status = ""
            switch state {
            case .discovered:
                status = "discovered"
            case .connected:
                status = "connected"
            case .verified:
                status = "verified"
            case .verificationFailed:
                status = "verificationFailed"
            @unknown default:
                status = "unknown"
            }
            print("[Flic] Scan state: \(status)")
            self.notifyListeners("flicScanStatus", data: ["status": status])
        }, completion: { button, error in
            if let button = button {
                print("[Flic] Scan complete — paired: \(button.name) (\(button.uuid))")
                button.delegate = self
                button.triggerMode = .clickAndDoubleClick
                button.connect()
                self.notifyListeners("flicButtonFound", data: [
                    "uuid": button.uuid,
                    "name": button.name,
                    "serialNumber": button.serialNumber
                ])
                call.resolve(["uuid": button.uuid, "name": button.name])
            } else if let error = error {
                print("[Flic] Scan complete — error: \(error.localizedDescription)")
                call.reject("Flic scan failed: \(error.localizedDescription)")
            }
        })
    }

    @objc func stopScanForFlicButtons(_ call: CAPPluginCall) {
        print("[Flic] stopScanForFlicButtons called, isScanning=\(FLICManager.shared()?.isScanning ?? false)")
        FLICManager.shared()?.stopScan()
        call.resolve()
    }

    @objc func getFlicButtons(_ call: CAPPluginCall) {
        guard let buttons = FLICManager.shared()?.buttons() else {
            print("[Flic] getFlicButtons: no manager")
            call.resolve(["buttons": []])
            return
        }
        let buttonList = buttons.map { button -> [String: Any] in
            let connState = button.state == .connected ? "connected" :
                           button.state == .connecting ? "connecting" : "disconnected"
            print("[Flic] getFlicButtons: \(button.name) — \(connState), ready=\(button.isReady), unpaired=\(button.isUnpaired), battery=\(button.batteryVoltage)V")
            return [
                "uuid": button.uuid,
                "name": button.name,
                "serialNumber": button.serialNumber,
                "connectionState": connState,
                "batteryVoltage": button.batteryVoltage,
                "isReady": button.isReady,
                "isUnpaired": button.isUnpaired
            ]
        }
        print("[Flic] getFlicButtons: returning \(buttonList.count) button(s)")
        call.resolve(["buttons": buttonList])
    }

    @objc func forgetFlicButton(_ call: CAPPluginCall) {
        guard let uuid = call.getString("uuid") else {
            call.reject("Missing uuid parameter")
            return
        }
        print("[Flic] forgetFlicButton: \(uuid)")
        guard let manager = FLICManager.shared() else {
            call.reject("Flic manager not available")
            return
        }
        guard let button = manager.buttons().first(where: { $0.uuid == uuid }) else {
            print("[Flic] forgetFlicButton: button not found")
            call.reject("Button not found")
            return
        }
        button.disconnect()
        manager.forgetButton(button) { removedUuid, error in
            if let error = error {
                print("[Flic] forgetFlicButton failed: \(error.localizedDescription)")
                call.reject("Failed to forget button: \(error.localizedDescription)")
            } else {
                print("[Flic] forgetFlicButton success: \(uuid)")
                self.notifyListeners("flicButtonForgotten", data: ["uuid": uuid])
                call.resolve(["uuid": removedUuid.uuidString])
            }
        }
    }

    // MARK: - Hardware PTT via Remote Control Events

    @objc func enableHardwarePTT(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
            self.bridge?.webView?.becomeFirstResponder()
            self.hardwarePTTEnabled = true
            call.resolve()
        }
    }

    @objc func disableHardwarePTT(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.endReceivingRemoteControlEvents()
            self.hardwarePTTEnabled = false
            self.isTransmitting = false
            call.resolve()
        }
    }

    @objc public func handleRemoteControlEvent(_ event: UIEvent) {
        guard hardwarePTTEnabled, event.type == .remoteControl else { return }

        switch event.subtype {
        case .remoteControlPlay, .remoteControlTogglePlayPause:
            if !isTransmitting {
                isTransmitting = true
                notifyListeners("hardwarePTTPressed", data: [:])
            } else {
                isTransmitting = false
                notifyListeners("hardwarePTTReleased", data: [:])
            }
        case .remoteControlPause, .remoteControlStop:
            if isTransmitting {
                isTransmitting = false
                notifyListeners("hardwarePTTReleased", data: [:])
            }
        default:
            break
        }
    }

    // MARK: - Plugin Methods

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        configureAudioSession()
        
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            call.resolve(["granted": granted])
        }
    }

    @objc func joinChannel(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func leaveChannel(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func requestBeginTransmitting(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func stopTransmitting(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func setActiveRemoteParticipant(_ call: CAPPluginCall) {
        call.resolve()
    }
}

// MARK: - Flic 2 Button Delegate Extensions

extension PushToTalkPlugin: FLICButtonDelegate {
    public func buttonDidConnect(_ button: FLICButton) {
        print("[Flic] buttonDidConnect: \(button.name) (\(button.uuid))")
        notifyListeners("flicConnected", data: ["uuid": button.uuid, "name": button.name])
    }

    public func buttonIsReady(_ button: FLICButton) {
        print("[Flic] buttonIsReady: \(button.name) — triggerMode=\(button.triggerMode.rawValue)")
        notifyListeners("flicReady", data: ["uuid": button.uuid, "name": button.name])
    }

    public func button(_ button: FLICButton, didDisconnectWithError error: (any Error)?) {
        print("[Flic] didDisconnect: \(button.name), error=\(error?.localizedDescription ?? "none"), unpaired=\(button.isUnpaired)")
        notifyListeners("flicDisconnected", data: ["uuid": button.uuid])
        if !button.isUnpaired {
            print("[Flic] Auto-reconnecting \(button.name)")
            button.connect()
        }
    }

    public func button(_ button: FLICButton, didFailToConnectWithError error: (any Error)?) {
        let message = error?.localizedDescription ?? "unknown"
        print("[Flic] didFailToConnect: \(button.name) — \(message)")
        notifyListeners("flicConnectionFailed", data: [
            "uuid": button.uuid,
            "error": message
        ])
    }

    public func button(_ button: FLICButton, didReceiveButtonDown queued: Bool, age: Int) {
        print("[Flic] buttonDown: queued=\(queued), age=\(age), pttEnabled=\(hardwarePTTEnabled), transmitting=\(isTransmitting)")
        guard hardwarePTTEnabled, !queued else { return }
        if !isTransmitting {
            isTransmitting = true
            print("[Flic] → hardwarePTTPressed")
            notifyListeners("hardwarePTTPressed", data: [:])
        }
    }

    public func button(_ button: FLICButton, didReceiveButtonUp queued: Bool, age: Int) {
        print("[Flic] buttonUp: queued=\(queued), age=\(age), pttEnabled=\(hardwarePTTEnabled), transmitting=\(isTransmitting)")
        guard hardwarePTTEnabled, !queued else { return }
        if isTransmitting {
            isTransmitting = false
            print("[Flic] → hardwarePTTReleased")
            notifyListeners("hardwarePTTReleased", data: [:])
        }
    }

    public func button(_ button: FLICButton, didReceiveButtonClick queued: Bool, age: Int) {
        print("[Flic] buttonClick: queued=\(queued), age=\(age) (ignored — PTT uses raw down/up)")
    }

    public func button(_ button: FLICButton, didReceiveButtonDoubleClick queued: Bool, age: Int) {
        print("[Flic] buttonDoubleClick: queued=\(queued), age=\(age)")
        guard !queued else { return }
        print("[Flic] → flicDoubleClick")
        notifyListeners("flicDoubleClick", data: ["uuid": button.uuid])
    }

    public func button(_ button: FLICButton, didReceiveButtonHold queued: Bool, age: Int) {
        print("[Flic] buttonHold: queued=\(queued), age=\(age) (ignored — avoids accidental triggers)")
    }

    public func button(_ button: FLICButton, didUnpairWithError error: (any Error)?) {
        print("[Flic] didUnpair: \(button.name), error=\(error?.localizedDescription ?? "none")")
        notifyListeners("flicUnpaired", data: ["uuid": button.uuid])
    }
}

extension PushToTalkPlugin: FLICManagerDelegate {
    public func managerDidRestoreState(_ manager: FLICManager) {
        let buttons = manager.buttons()
        print("[Flic] managerDidRestoreState: \(buttons.count) button(s)")
        for button in buttons {
            button.delegate = self
            button.triggerMode = .clickAndDoubleClick
            print("[Flic]   \(button.name) — state=\(button.state.rawValue), unpaired=\(button.isUnpaired)")
            if button.state == .disconnected && !button.isUnpaired {
                print("[Flic]   → connecting \(button.name)")
                button.connect()
            }
        }
    }

    public func manager(_ manager: FLICManager, didUpdate state: FLICManagerState) {
        flicManagerState = state
        var stateStr = "unknown"
        switch state {
        case .poweredOn: stateStr = "poweredOn"
        case .poweredOff: stateStr = "poweredOff"
        case .unauthorized: stateStr = "unauthorized"
        case .unsupported: stateStr = "unsupported"
        case .resetting: stateStr = "resetting"
        default: break
        }
        print("[Flic] managerDidUpdateState: \(stateStr)")
        notifyListeners("flicBluetoothState", data: ["state": stateStr])
    }
}
