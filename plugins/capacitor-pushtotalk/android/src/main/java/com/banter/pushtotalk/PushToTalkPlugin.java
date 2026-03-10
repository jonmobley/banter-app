package com.banter.pushtotalk;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
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
 * 3. Audio focus management for phone call interruptions
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
    private boolean wasTransmittingBeforeInterruption = false;
    private AudioFocusRequest audioFocusRequest;
    private AudioManager audioManager;

    @Override
    public void load() {
        super.load();
        setupAudioFocusHandling();
        initializeFlicManager();
    }

    private void setupAudioFocusHandling() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

        AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
            switch (focusChange) {
                case AudioManager.AUDIOFOCUS_LOSS:
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    android.util.Log.d("PushToTalk", "Audio focus lost (phone call, other app, etc.)");
                    wasTransmittingBeforeInterruption = isTransmitting;
                    if (isTransmitting) {
                        isTransmitting = false;
                        notifyListeners("hardwarePTTReleased", new JSObject());
                    }
                    JSObject interruptData = new JSObject();
                    interruptData.put("reason", "began");
                    notifyListeners("audioInterrupted", interruptData);
                    break;

                case AudioManager.AUDIOFOCUS_GAIN:
                    android.util.Log.d("PushToTalk", "Audio focus regained");
                    JSObject resumeData = new JSObject();
                    resumeData.put("shouldResume", true);
                    notifyListeners("audioResumed", resumeData);
                    break;

                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    break;
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .setOnAudioFocusChangeListener(focusChangeListener)
                .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        }

        try {
            TelephonyManager telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
            if (telephonyManager != null) {
                telephonyManager.listen(new PhoneStateListener() {
                    @Override
                    public void onCallStateChanged(int state, String phoneNumber) {
                        switch (state) {
                            case TelephonyManager.CALL_STATE_RINGING:
                            case TelephonyManager.CALL_STATE_OFFHOOK:
                                android.util.Log.d("PushToTalk", "Phone call active — audio interrupted");
                                wasTransmittingBeforeInterruption = isTransmitting;
                                if (isTransmitting) {
                                    isTransmitting = false;
                                    notifyListeners("hardwarePTTReleased", new JSObject());
                                }
                                JSObject callInterruptData = new JSObject();
                                callInterruptData.put("reason", "began");
                                notifyListeners("audioInterrupted", callInterruptData);
                                break;

                            case TelephonyManager.CALL_STATE_IDLE:
                                android.util.Log.d("PushToTalk", "Phone call ended — resuming audio");
                                JSObject callResumeData = new JSObject();
                                callResumeData.put("shouldResume", true);
                                notifyListeners("audioResumed", callResumeData);
                                break;
                        }
                    }
                }, PhoneStateListener.LISTEN_CALL_STATE);
            }
        } catch (Exception e) {
            android.util.Log.w("PushToTalk", "Could not listen for phone state: " + e.getMessage());
        }
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
    //             // Intentionally not mapped — avoids accidental triggers during long PTT holds
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
