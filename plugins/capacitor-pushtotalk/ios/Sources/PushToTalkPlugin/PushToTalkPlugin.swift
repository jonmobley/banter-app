/**
 * PushToTalk Capacitor Plugin
 * 
 * This plugin wraps Apple's PushToTalk framework (iOS 16+) for Capacitor apps.
 * It enables hardware button control (e.g., EarPods center button) for PTT functionality.
 * 
 * IMPORTANT: To use this plugin, you need:
 * 1. iOS 16.0+ deployment target
 * 2. PushToTalk entitlement (requires Apple approval)
 * 3. Background Modes: Audio, Voice over IP
 * 4. Push Notifications capability
 * 5. NSMicrophoneUsageDescription in Info.plist
 */

import Foundation
import Capacitor
import PushToTalk
import AVFoundation

@objc(PushToTalkPlugin)
public class PushToTalkPlugin: CAPPlugin, CAPBridgedPlugin, PTChannelManagerDelegate {
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
    ]
    
    private var channelManager: PTChannelManager?
    private var activeChannelUUID: UUID?
    
    // MARK: - Plugin Methods
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }
    
    @objc func requestPermission(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            call.resolve(["granted": granted])
        }
    }
    
    @objc func joinChannel(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("PushToTalk requires iOS 16.0 or later")
            return
        }
        
        guard let channelUUIDString = call.getString("channelUUID"),
              let channelUUID = UUID(uuidString: channelUUIDString),
              let channelName = call.getString("channelName") else {
            call.reject("Missing required parameters: channelUUID, channelName")
            return
        }
        
        // Initialize channel manager if needed
        if channelManager == nil {
            PTChannelManager.channelManager(delegate: self, restorationDelegate: self) { manager, error in
                if let error = error {
                    call.reject("Failed to create channel manager: \(error.localizedDescription)")
                    return
                }
                self.channelManager = manager
                self.joinChannelInternal(channelUUID: channelUUID, channelName: channelName, call: call)
            }
        } else {
            joinChannelInternal(channelUUID: channelUUID, channelName: channelName, call: call)
        }
    }
    
    @available(iOS 16.0, *)
    private func joinChannelInternal(channelUUID: UUID, channelName: String, call: CAPPluginCall) {
        let channelDescriptor = PTChannelDescriptor(name: channelName, image: nil)
        
        channelManager?.requestJoinChannel(channelUUID: channelUUID, descriptor: channelDescriptor)
        activeChannelUUID = channelUUID
        call.resolve()
    }
    
    @objc func leaveChannel(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("PushToTalk requires iOS 16.0 or later")
            return
        }
        
        guard let channelUUID = activeChannelUUID else {
            call.reject("No active channel to leave")
            return
        }
        
        channelManager?.leaveChannel(channelUUID: channelUUID)
        activeChannelUUID = nil
        call.resolve()
    }
    
    @objc func requestBeginTransmitting(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("PushToTalk requires iOS 16.0 or later")
            return
        }
        
        guard let channelUUID = activeChannelUUID else {
            call.reject("No active channel")
            return
        }
        
        channelManager?.requestBeginTransmitting(channelUUID: channelUUID)
        call.resolve()
    }
    
    @objc func stopTransmitting(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("PushToTalk requires iOS 16.0 or later")
            return
        }
        
        guard let channelUUID = activeChannelUUID else {
            call.reject("No active channel")
            return
        }
        
        channelManager?.stopTransmitting(channelUUID: channelUUID)
        call.resolve()
    }
    
    @objc func setActiveRemoteParticipant(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("PushToTalk requires iOS 16.0 or later")
            return
        }
        
        guard let channelUUID = activeChannelUUID,
              let participantName = call.getString("participantName") else {
            call.reject("Missing required parameters")
            return
        }
        
        let participant = PTParticipant(name: participantName, image: nil)
        channelManager?.setActiveRemoteParticipant(participant, channelUUID: channelUUID)
        call.resolve()
    }
    
    // MARK: - PTChannelManagerDelegate
    
    @available(iOS 16.0, *)
    public func channelManager(_ channelManager: PTChannelManager, didJoinChannel channelUUID: UUID, reason: PTChannelJoinReason) {
        notifyListeners("channelJoined", data: ["channelUUID": channelUUID.uuidString])
    }
    
    @available(iOS 16.0, *)
    public func channelManager(_ channelManager: PTChannelManager, didLeaveChannel channelUUID: UUID, reason: PTChannelLeaveReason) {
        notifyListeners("channelLeft", data: [
            "channelUUID": channelUUID.uuidString,
            "reason": String(describing: reason)
        ])
    }
    
    @available(iOS 16.0, *)
    public func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didBeginTransmittingFrom source: PTChannelTransmitRequestSource) {
        notifyListeners("transmissionStarted", data: [
            "source": source == .userRequest ? "app" : "system"
        ])
    }
    
    @available(iOS 16.0, *)
    public func channelManager(_ channelManager: PTChannelManager, channelUUID: UUID, didEndTransmittingFrom source: PTChannelTransmitRequestSource) {
        notifyListeners("transmissionEnded", data: [
            "reason": String(describing: source)
        ])
    }
    
    @available(iOS 16.0, *)
    public func incomingPushResult(channelManager: PTChannelManager, channelUUID: UUID, pushPayload: [String : Any]) -> PTPushResult {
        // Handle incoming PTT push notifications
        // Return appropriate push result based on your app logic
        return .activeRemoteParticipant(PTParticipant(name: "Incoming", image: nil))
    }
}

// MARK: - PTChannelRestorationDelegate

@available(iOS 16.0, *)
extension PushToTalkPlugin: PTChannelRestorationDelegate {
    public func channelDescriptor(restoredChannelUUID channelUUID: UUID) -> PTChannelDescriptor {
        // Return a descriptor for restored channels
        return PTChannelDescriptor(name: "Banter", image: nil)
    }
}
