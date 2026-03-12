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
        print("[Flic] ===== PushToTalkPlugin load() =====")
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
            print("[Flic] Failed to configure audio session: \(error)")
        }
    }

    // MARK: - Audio Session Interruption Handling

    private func observeAudioInterruptions() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleAudioInterruption),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleAudioRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func handleAudioInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            print("[Flic] Audio interrupted")
            wasTransmittingBeforeInterruption = isTransmitting
            if isTransmitting {
                isTransmitting = false
                notifyListeners("hardwarePTTReleased", data: [:])
            }
            notifyListeners("audioInterrupted", data: ["reason": "began"])
        case .ended:
            print("[Flic] Audio interruption ended")
            let options = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)
            if shouldResume {
                do { try AVAudioSession.sharedInstance().setActive(true) } catch {
                    print("[Flic] Failed to reactivate audio session: \(error)")
                }
            }
            notifyListeners("audioResumed", data: ["shouldResume": shouldResume])
        @unknown default: break
        }
    }

    @objc private func handleAudioRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

        switch reason {
        case .oldDeviceUnavailable:
            notifyListeners("audioRouteChanged", data: ["reason": "deviceUnavailable"])
        case .newDeviceAvailable:
            notifyListeners("audioRouteChanged", data: ["reason": "newDevice"])
        default: break
        }
    }

    // MARK: - Flic 2 Integration

    private func initializeFlicManager() {
        FLICManager.configure(with: self, buttonDelegate: self, background: true)
        flicManagerInitialized = true
        print("[Flic] Flic manager initialized")
    }

    @objc func scanForFlicButtons(_ call: CAPPluginCall) {
        print("[Flic] scanForFlicButtons called, managerInit=\(flicManagerInitialized), btState=\(flicManagerState.rawValue)")
        guard flicManagerInitialized else {
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
            call.reject(reason)
            return
        }
        print("[Flic] Starting native scan...")
        FLICManager.shared()?.scanForButtons(stateChangeHandler: { state in
            var status = ""
            switch state {
            case .discovered: status = "discovered"
            case .connected: status = "connected"
            case .verified: status = "verified"
            case .verificationFailed: status = "verificationFailed"
            @unknown default: status = "unknown"
            }
            print("[Flic] Scan state: \(status)")
            self.notifyListeners("flicScanStatus", data: ["status": status])
        }, completion: { button, error in
            if let button = button {
                let name = button.name ?? "unknown"
                print("[Flic] Scan complete — paired: \(name) (\(button.uuid))")
                button.delegate = self
                button.triggerMode = .clickAndDoubleClickAndHold
                button.connect()
                self.notifyListeners("flicButtonFound", data: [
                    "uuid": button.uuid,
                    "name": name,
                    "serialNumber": button.serialNumber
                ])
                call.resolve(["uuid": button.uuid, "name": name])
            } else if let error = error {
                print("[Flic] Scan error: \(error.localizedDescription)")
                call.reject("Flic scan failed: \(error.localizedDescription)")
            }
        })
    }

    @objc func stopScanForFlicButtons(_ call: CAPPluginCall) {
        FLICManager.shared()?.stopScan()
        call.resolve()
    }

    @objc func getFlicButtons(_ call: CAPPluginCall) {
        guard let buttons = FLICManager.shared()?.buttons() else {
            call.resolve(["buttons": []])
            return
        }
        let buttonList = buttons.map { button -> [String: Any] in
            let connState = button.state == .connected ? "connected" :
                           button.state == .connecting ? "connecting" : "disconnected"
            let name = button.name ?? "unknown"
            print("[Flic] getFlicButtons: \(name) — \(connState), ready=\(button.isReady)")
            return [
                "uuid": button.uuid, "name": name,
                "serialNumber": button.serialNumber,
                "connectionState": connState,
                "batteryVoltage": button.batteryVoltage,
                "isReady": button.isReady, "isUnpaired": button.isUnpaired
            ]
        }
        call.resolve(["buttons": buttonList])
    }

    @objc func forgetFlicButton(_ call: CAPPluginCall) {
        guard let uuid = call.getString("uuid") else {
            call.reject("Missing uuid parameter")
            return
        }
        guard let manager = FLICManager.shared() else {
            call.reject("Flic manager not available")
            return
        }
        guard let button = manager.buttons().first(where: { $0.uuid == uuid }) else {
            call.reject("Button not found")
            return
        }
        button.disconnect()
        manager.forgetButton(button) { removedUuid, error in
            if let error = error {
                call.reject("Failed to forget button: \(error.localizedDescription)")
            } else {
                self.notifyListeners("flicButtonForgotten", data: ["uuid": uuid])
                call.resolve(["uuid": removedUuid.uuidString])
            }
        }
    }

    // MARK: - Hardware PTT via Remote Control Events

    @objc func enableHardwarePTT(_ call: CAPPluginCall) {
        print("[Flic] enableHardwarePTT called")
        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
            self.bridge?.webView?.becomeFirstResponder()
            self.hardwarePTTEnabled = true
            print("[Flic] hardwarePTTEnabled = true")
            call.resolve()
        }
    }

    @objc func disableHardwarePTT(_ call: CAPPluginCall) {
        print("[Flic] disableHardwarePTT called")
        DispatchQueue.main.async {
            UIApplication.shared.endReceivingRemoteControlEvents()
            self.hardwarePTTEnabled = false
            self.isTransmitting = false
            print("[Flic] hardwarePTTEnabled = false")
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
        default: break
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

    @objc func joinChannel(_ call: CAPPluginCall) { call.resolve() }
    @objc func leaveChannel(_ call: CAPPluginCall) { call.resolve() }
    @objc func requestBeginTransmitting(_ call: CAPPluginCall) { call.resolve() }
    @objc func stopTransmitting(_ call: CAPPluginCall) { call.resolve() }
    @objc func setActiveRemoteParticipant(_ call: CAPPluginCall) { call.resolve() }
}

// MARK: - Flic 2 Button Delegate

extension PushToTalkPlugin: FLICButtonDelegate {
    public func buttonDidConnect(_ button: FLICButton) {
        let name = button.name ?? "unknown"
        print("[Flic] buttonDidConnect: \(name) (\(button.uuid))")
        button.delegate = self
        button.triggerMode = .clickAndDoubleClickAndHold
        notifyListeners("flicConnected", data: ["uuid": button.uuid, "name": name])
    }

    public func buttonIsReady(_ button: FLICButton) {
        let name = button.name ?? "unknown"
        print("[Flic] buttonIsReady: \(name), triggerMode=\(button.triggerMode.rawValue)")
        button.delegate = self
        button.triggerMode = .clickAndDoubleClickAndHold
        print("[Flic] → enforced triggerMode=\(button.triggerMode.rawValue)")
        notifyListeners("flicReady", data: ["uuid": button.uuid, "name": name])
    }

    public func button(_ button: FLICButton, didDisconnectWithError error: (any Error)?) {
        let name = button.name ?? "unknown"
        print("[Flic] didDisconnect: \(name), error=\(error?.localizedDescription ?? "none")")
        notifyListeners("flicDisconnected", data: ["uuid": button.uuid])
        if !button.isUnpaired {
            print("[Flic] Auto-reconnecting \(name)")
            button.connect()
        }
    }

    public func button(_ button: FLICButton, didFailToConnectWithError error: (any Error)?) {
        print("[Flic] didFailToConnect: \(button.name ?? "unknown") — \(error?.localizedDescription ?? "unknown")")
        notifyListeners("flicConnectionFailed", data: [
            "uuid": button.uuid, "error": error?.localizedDescription ?? "unknown"
        ])
    }

    public func button(_ button: FLICButton, didReceive event: FLICButtonEvent) {
        print("[Flic] ★ EVENT: class=\(event.eventClass.rawValue) type=\(event.type.rawValue) queued=\(event.wasQueued) age=\(event.age) pttEnabled=\(hardwarePTTEnabled) transmitting=\(isTransmitting)")

        event.isButtonDown { _ in
            print("[Flic] ★ buttonDown")
            guard self.hardwarePTTEnabled else {
                print("[Flic] ⚠️ IGNORED — ptt disabled")
                return
            }
            guard !event.wasQueued else {
                print("[Flic] ⚠️ IGNORED — queued")
                return
            }
            if !self.isTransmitting {
                self.isTransmitting = true
                print("[Flic] → EMIT hardwarePTTPressed")
                self.notifyListeners("hardwarePTTPressed", data: [:])
            }
        }

        event.isButtonUp { _ in
            print("[Flic] ★ buttonUp")
            guard self.hardwarePTTEnabled else {
                print("[Flic] ⚠️ IGNORED — ptt disabled")
                return
            }
            guard !event.wasQueued else {
                print("[Flic] ⚠️ IGNORED — queued")
                return
            }
            if self.isTransmitting {
                self.isTransmitting = false
                print("[Flic] → EMIT hardwarePTTReleased")
                self.notifyListeners("hardwarePTTReleased", data: [:])
            }
        }

        event.isSingleOrDoubleClickOrHold { eventType, _ in
            switch eventType {
            case .doubleClick:
                print("[Flic] ★ doubleClick")
                guard !event.wasQueued else { return }
                print("[Flic] → EMIT flicDoubleClick")
                self.notifyListeners("flicDoubleClick", data: ["uuid": button.uuid])
            case .hold:
                print("[Flic] ★ hold — ignored")
            case .singleClick:
                print("[Flic] ★ singleClick — ignored")
            default:
                print("[Flic] ★ other: \(eventType.rawValue)")
            }
        }
    }

    public func button(_ button: FLICButton, didUnpairWithError error: (any Error)?) {
        print("[Flic] didUnpair: \(button.name ?? "unknown")")
        notifyListeners("flicUnpaired", data: ["uuid": button.uuid])
    }
}

// MARK: - Flic Manager Delegate

extension PushToTalkPlugin: FLICManagerDelegate {
    public func managerDidRestoreState(_ manager: FLICManager) {
        let buttons = manager.buttons()
        print("[Flic] managerDidRestoreState: \(buttons.count) button(s)")
        for button in buttons {
            let name = button.name ?? "unknown"
            button.delegate = self
            button.triggerMode = .clickAndDoubleClickAndHold
            print("[Flic]   \(name) — state=\(button.state.rawValue), unpaired=\(button.isUnpaired)")
            if button.state == .disconnected && !button.isUnpaired {
                print("[Flic]   → connecting \(name)")
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
