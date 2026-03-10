import Foundation
import Capacitor
import AVFoundation
import CoreBluetooth

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
    ]

    private var hardwarePTTEnabled = false
    private var isTransmitting = false
    private var flicManagerInitialized = false

    override public func load() {
        super.load()
        configureAudioSession()
        initializeFlicManager()
    }

    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
            )
            try audioSession.setActive(true)
        } catch {
            print("PushToTalk: Failed to configure audio session: \(error)")
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
        // FLIC INTEGRATION - Uncomment when flic2lib.xcframework is added to Xcode project:
        //
        // import flic2lib  (add at top of file)
        //
        // FLICManager.configure(with: self, buttonDelegate: self, background: true)
        // flicManagerInitialized = true
        // print("PushToTalk: Flic manager initialized")

        print("PushToTalk: Flic SDK not yet linked — add flic2lib.xcframework to enable Flic button support")
    }

    @objc func scanForFlicButtons(_ call: CAPPluginCall) {
        // FLIC INTEGRATION - Uncomment when flic2lib.xcframework is added:
        //
        // guard flicManagerInitialized else {
        //     call.reject("Flic manager not initialized")
        //     return
        // }
        // FLICManager.shared()?.scanForButtons(stateChangeHandler: { state in
        //     switch state {
        //     case .discovered:
        //         print("PushToTalk: Flic button discovered")
        //     case .connected:
        //         print("PushToTalk: Flic button connected")
        //     default:
        //         break
        //     }
        // }, completion: { button, error in
        //     if let button = button {
        //         button.delegate = self
        //         button.triggerMode = .clickAndDoubleClickAndHold
        //         self.notifyListeners("flicButtonFound", data: [
        //             "uuid": button.uuid,
        //             "name": button.name ?? "Flic Button",
        //             "serialNumber": button.serialNumber ?? ""
        //         ])
        //         call.resolve(["uuid": button.uuid, "name": button.name ?? "Flic Button"])
        //     } else if let error = error {
        //         call.reject("Flic scan failed: \(error.localizedDescription)")
        //     }
        // })

        call.reject("Flic SDK not linked — add flic2lib.xcframework to enable Flic support")
    }

    @objc func stopScanForFlicButtons(_ call: CAPPluginCall) {
        // FLIC INTEGRATION - Uncomment when flic2lib.xcframework is added:
        // FLICManager.shared()?.stopScan()

        call.resolve()
    }

    @objc func getFlicButtons(_ call: CAPPluginCall) {
        // FLIC INTEGRATION - Uncomment when flic2lib.xcframework is added:
        //
        // guard let buttons = FLICManager.shared()?.buttons() else {
        //     call.resolve(["buttons": []])
        //     return
        // }
        // let buttonList = buttons.map { button -> [String: Any] in
        //     return [
        //         "uuid": button.uuid,
        //         "name": button.name ?? "Flic Button",
        //         "serialNumber": button.serialNumber ?? "",
        //         "connectionState": button.state == .connected ? "connected" :
        //                           button.state == .connecting ? "connecting" : "disconnected",
        //         "batteryVoltage": button.batteryVoltage
        //     ]
        // }
        // call.resolve(["buttons": buttonList])

        call.resolve(["buttons": []])
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
//
// FLIC INTEGRATION — Uncomment the extensions below when flic2lib.xcframework
// is added to the Xcode project. These MUST be outside the class body (Swift
// extensions cannot be nested inside a class declaration).
//
// import flic2lib  (add at top of file alongside other imports)
//
// extension PushToTalkPlugin: FLICButtonDelegate {
//     public func flicButton(_ button: FLICButton, didReceiveButtonDown queued: Bool, age: Int) {
//         guard hardwarePTTEnabled else { return }
//         if !isTransmitting {
//             isTransmitting = true
//             notifyListeners("hardwarePTTPressed", data: [:])
//         }
//     }
//
//     public func flicButton(_ button: FLICButton, didReceiveButtonUp queued: Bool, age: Int) {
//         guard hardwarePTTEnabled else { return }
//         if isTransmitting {
//             isTransmitting = false
//             notifyListeners("hardwarePTTReleased", data: [:])
//         }
//     }
//
//     public func flicButton(_ button: FLICButton, didReceiveButtonClick queued: Bool, age: Int) {
//         // Not used — PTT relies on raw down/up events only
//     }
//
//     public func flicButton(_ button: FLICButton, didReceiveButtonDoubleClick queued: Bool, age: Int) {
//         // Intentionally not mapped — avoids accidental triggers during long PTT holds
//     }
//
//     public func flicButton(_ button: FLICButton, didReceiveButtonHold queued: Bool, age: Int) {
//         // Intentionally not mapped — avoids accidental triggers during long PTT holds
//     }
//
//     public func flicButton(_ button: FLICButton, didDisconnectWithError error: Error?) {
//         notifyListeners("flicDisconnected", data: ["uuid": button.uuid])
//     }
//
//     public func flicButton(_ button: FLICButton, didConnect complete: Bool) {
//         notifyListeners("flicConnected", data: ["uuid": button.uuid, "name": button.name ?? "Flic Button"])
//     }
// }
//
// extension PushToTalkPlugin: FLICManagerDelegate {
//     public func managerDidRestoreState(_ manager: FLICManager) {
//         for button in manager.buttons() {
//             button.delegate = self
//             button.triggerMode = .clickAndDoubleClickAndHold
//         }
//     }
// }
