package com.banter.pushtotalk;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PushToTalk Capacitor Plugin - Android Stub
 * 
 * Apple's PushToTalk framework is iOS-only. This Android implementation
 * provides stub methods that return appropriate error messages.
 * 
 * For Android PTT functionality, consider using:
 * - MediaButton intents for wired headset buttons
 * - Bluetooth HID for wireless PTT buttons
 */
@CapacitorPlugin(name = "PushToTalk")
public class PushToTalkPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", false);
        call.reject("PushToTalk framework is only available on iOS 16+");
    }

    @PluginMethod
    public void joinChannel(PluginCall call) {
        call.reject("PushToTalk framework is only available on iOS 16+");
    }

    @PluginMethod
    public void leaveChannel(PluginCall call) {
        call.reject("PushToTalk framework is only available on iOS 16+");
    }

    @PluginMethod
    public void requestBeginTransmitting(PluginCall call) {
        call.reject("PushToTalk framework is only available on iOS 16+");
    }

    @PluginMethod
    public void stopTransmitting(PluginCall call) {
        call.reject("PushToTalk framework is only available on iOS 16+");
    }

    @PluginMethod
    public void setActiveRemoteParticipant(PluginCall call) {
        call.reject("PushToTalk framework is only available on iOS 16+");
    }
}
