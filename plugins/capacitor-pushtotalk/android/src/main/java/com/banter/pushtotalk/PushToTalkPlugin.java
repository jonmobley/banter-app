package com.banter.pushtotalk;

import android.view.KeyEvent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PushToTalk Capacitor Plugin - Android
 *
 * Handles:
 * 1. HID media key events from wired/BT PTT accessories (Klein Victory, etc.)
 * 2. Flic 2 button events via flic2lib-android SDK
 *
 * FLIC SETUP:
 * 1. Add JitPack to repositories in build.gradle
 * 2. Add dependency: implementation 'com.github.50ButtonsEach:flic2lib-android:2.+'
 * 3. Uncomment the Flic integration code below
 */
@CapacitorPlugin(name = "PushToTalk")
public class PushToTalkPlugin extends Plugin {

    private boolean hardwarePTTEnabled = false;
    private boolean isTransmitting = false;
    private boolean flicManagerInitialized = false;

    @Override
    public void load() {
        super.load();
        initializeFlicManager();
    }

    private void initializeFlicManager() {
        // FLIC INTEGRATION - Uncomment when flic2lib-android dependency is added:
        //
        // import io.flic.flic2libandroid.Flic2Manager;  (add at top of file)
        // import io.flic.flic2libandroid.Flic2Button;
        // import io.flic.flic2libandroid.Flic2ButtonListener;
        //
        // Flic2Manager.initAndGetInstance(getContext(), new Handler(Looper.getMainLooper()));
        // flicManagerInitialized = true;
        //
        // // Reconnect previously paired buttons
        // for (Flic2Button button : Flic2Manager.getInstance().getButtons()) {
        //     button.connect();
        //     listenToFlicButton(button);
        // }
    }

    // FLIC INTEGRATION - Uncomment when flic2lib-android dependency is added:
    //
    // private void listenToFlicButton(Flic2Button button) {
    //     button.addListener(new Flic2ButtonListener() {
    //         @Override
    //         public void onButtonDown(Flic2Button button, boolean wasQueued, boolean lastQueued, long timestamp, boolean isQueued, int age) {
    //             if (hardwarePTTEnabled && !isTransmitting) {
    //                 isTransmitting = true;
    //                 notifyListeners("hardwarePTTPressed", new JSObject());
    //             }
    //         }
    //
    //         @Override
    //         public void onButtonUp(Flic2Button button, boolean wasQueued, boolean lastQueued, long timestamp, boolean isQueued, int age) {
    //             if (hardwarePTTEnabled && isTransmitting) {
    //                 isTransmitting = false;
    //                 notifyListeners("hardwarePTTReleased", new JSObject());
    //             }
    //         }
    //
    //         @Override
    //         public void onButtonClickOrHold(Flic2Button button, boolean wasQueued, boolean lastQueued, long timestamp, boolean isClick, boolean isHold, int age) {
    //             if (isHold) {
    //                 JSObject data = new JSObject();
    //                 data.put("uuid", button.getUuid());
    //                 notifyListeners("flicHold", data);
    //             }
    //         }
    //
    //         @Override
    //         public void onButtonSingleOrDoubleClick(Flic2Button button, boolean wasQueued, boolean lastQueued, long timestamp, boolean isSingleClick, boolean isDoubleClick, int age) {
    //             if (isDoubleClick) {
    //                 JSObject data = new JSObject();
    //                 data.put("uuid", button.getUuid());
    //                 notifyListeners("flicDoubleClick", data);
    //             }
    //         }
    //
    //         @Override
    //         public void onConnect(Flic2Button button) {
    //             JSObject data = new JSObject();
    //             data.put("uuid", button.getUuid());
    //             data.put("name", button.getName() != null ? button.getName() : "Flic Button");
    //             notifyListeners("flicConnected", data);
    //         }
    //
    //         @Override
    //         public void onReady(Flic2Button button) {}
    //
    //         @Override
    //         public void onDisconnect(Flic2Button button) {
    //             JSObject data = new JSObject();
    //             data.put("uuid", button.getUuid());
    //             notifyListeners("flicDisconnected", data);
    //         }
    //
    //         @Override
    //         public void onFailure(Flic2Button button, int errorCode, int subCode) {}
    //
    //         @Override
    //         public void onUnpaired(Flic2Button button) {}
    //     });
    // }

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

    @PluginMethod
    public void scanForFlicButtons(PluginCall call) {
        // FLIC INTEGRATION - Uncomment when flic2lib-android dependency is added:
        //
        // if (!flicManagerInitialized) {
        //     call.reject("Flic manager not initialized");
        //     return;
        // }
        // Flic2Manager.getInstance().startScan(new Flic2ScanCallback() {
        //     @Override
        //     public void onDiscoveredAlreadyPairedButton(Flic2Button button) {
        //         button.connect();
        //         listenToFlicButton(button);
        //         JSObject data = new JSObject();
        //         data.put("uuid", button.getUuid());
        //         data.put("name", button.getName() != null ? button.getName() : "Flic Button");
        //         notifyListeners("flicButtonFound", data);
        //     }
        //
        //     @Override
        //     public void onDiscovered(Flic2Button button) {
        //         button.connect();
        //         listenToFlicButton(button);
        //         JSObject data = new JSObject();
        //         data.put("uuid", button.getUuid());
        //         data.put("name", button.getName() != null ? button.getName() : "Flic Button");
        //         notifyListeners("flicButtonFound", data);
        //         call.resolve(data);
        //     }
        //
        //     @Override
        //     public void onComplete(int result, int subCode, Flic2Button button) {
        //         if (button != null) {
        //             JSObject data = new JSObject();
        //             data.put("uuid", button.getUuid());
        //             data.put("name", button.getName() != null ? button.getName() : "Flic Button");
        //             call.resolve(data);
        //         } else {
        //             call.reject("Flic scan completed without finding a button");
        //         }
        //     }
        // });

        call.reject("Flic SDK not linked — add flic2lib-android dependency to enable Flic support");
    }

    @PluginMethod
    public void stopScanForFlicButtons(PluginCall call) {
        // FLIC INTEGRATION - Uncomment when flic2lib-android dependency is added:
        // Flic2Manager.getInstance().stopScan();

        call.resolve();
    }

    @PluginMethod
    public void getFlicButtons(PluginCall call) {
        // FLIC INTEGRATION - Uncomment when flic2lib-android dependency is added:
        //
        // JSArray buttonList = new JSArray();
        // for (Flic2Button button : Flic2Manager.getInstance().getButtons()) {
        //     JSObject obj = new JSObject();
        //     obj.put("uuid", button.getUuid());
        //     obj.put("name", button.getName() != null ? button.getName() : "Flic Button");
        //     obj.put("serialNumber", button.getSerialNumber() != null ? button.getSerialNumber() : "");
        //     obj.put("connectionState", button.getConnectionState() == Flic2Button.CONNECTION_STATE_CONNECTED
        //         ? "connected"
        //         : button.getConnectionState() == Flic2Button.CONNECTION_STATE_CONNECTING
        //             ? "connecting" : "disconnected");
        //     obj.put("batteryVoltage", button.getLastKnownBatteryVoltage());
        //     buttonList.put(obj);
        // }
        // JSObject ret = new JSObject();
        // ret.put("buttons", buttonList);
        // call.resolve(ret);

        JSObject ret = new JSObject();
        ret.put("buttons", new JSArray());
        call.resolve(ret);
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
