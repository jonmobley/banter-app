package com.banter.pushtotalk;

import android.view.KeyEvent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PushToTalk")
public class PushToTalkPlugin extends Plugin {

    private boolean hardwarePTTEnabled = false;
    private boolean isTransmitting = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void enableHardwarePTT(PluginCall call) {
        hardwarePTTEnabled = true;
        isTransmitting = false;
        call.resolve();
    }

    @PluginMethod
    public void disableHardwarePTT(PluginCall call) {
        hardwarePTTEnabled = false;
        isTransmitting = false;
        call.resolve();
    }

    @Override
    public boolean handleOnKeyDown(int keyCode, KeyEvent event) {
        if (!hardwarePTTEnabled) return false;

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
            keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) {

            if (!isTransmitting) {
                isTransmitting = true;
                notifyListeners("hardwarePTTPressed", new JSObject());
            }
            return true;
        }
        return false;
    }

    @Override
    public boolean handleOnKeyUp(int keyCode, KeyEvent event) {
        if (!hardwarePTTEnabled) return false;

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
            keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE ||
            keyCode == KeyEvent.KEYCODE_MEDIA_STOP) {

            if (isTransmitting) {
                isTransmitting = false;
                notifyListeners("hardwarePTTReleased", new JSObject());
            }
            return true;
        }
        return false;
    }

    @PluginMethod
    public void joinChannel(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void leaveChannel(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void requestBeginTransmitting(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void stopTransmitting(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setActiveRemoteParticipant(PluginCall call) {
        call.resolve();
    }
}
