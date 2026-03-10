import Foundation
import Capacitor
import AVFoundation

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
    ]

    private var hardwarePTTEnabled = false
    private var isTransmitting = false

    override public func load() {
        super.load()
        configureAudioSession()
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
