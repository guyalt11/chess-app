package com.minimalapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.*

class StockfishModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var process: Process? = null
    private var outputReader: BufferedReader? = null
    private var inputWriter: BufferedWriter? = null
    private var isRunning = false

    override fun getName(): String {
        return "StockfishModule"
    }

    @ReactMethod
    fun initEngine(promise: Promise) {
        try {
            val engineDir = File(reactApplicationContext.filesDir, "stockfish")
            if (!engineDir.exists()) engineDir.mkdirs()

            // Extract NNUE files from assets
            val assetFiles = reactApplicationContext.assets.list("stockfish") ?: emptyArray()
            for (fileName in assetFiles) {
                if (fileName.endsWith(".nnue")) {
                    val nnueFile = File(engineDir, fileName)
                    reactApplicationContext.assets.open("stockfish/$fileName").use { input ->
                        FileOutputStream(nnueFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }
            }

            promise.resolve("Engine assets initialized")
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startEngine(promise: Promise) {
        if (isRunning) {
            promise.resolve("Already running")
            return
        }

        try {
            val libraryDir = reactApplicationContext.applicationInfo.nativeLibraryDir
            val binaryFile = File(libraryDir, "libstockfish.so")
            
            if (!binaryFile.exists()) {
                 promise.reject("START_ERROR", "Engine binary not found at ${binaryFile.absolutePath}")
                 return
            }

            val workingDir = File(reactApplicationContext.filesDir, "stockfish")
            if (!workingDir.exists()) workingDir.mkdirs()

            process = ProcessBuilder(binaryFile.absolutePath)
                .directory(workingDir)
                .redirectErrorStream(true)
                .start()

            outputReader = BufferedReader(InputStreamReader(process?.inputStream))
            inputWriter = BufferedWriter(OutputStreamWriter(process?.outputStream))
            isRunning = true

            Thread {
                try {
                    while (isRunning) {
                        val line = outputReader?.readLine() ?: break
                        sendEvent("onStockfishOutput", line)
                    }
                } catch (e: Exception) {
                    sendEvent("onStockfishError", e.message)
                }
            }.start()

            promise.resolve("Engine started")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun sendCommand(command: String) {
        try {
            inputWriter?.write(command + "\n")
            inputWriter?.flush()
        } catch (e: Exception) {
            sendEvent("onStockfishError", "Failed to send command: ${e.message}")
        }
    }

    @ReactMethod
    fun stopEngine() {
        isRunning = false
        process?.destroy()
        process = null
        inputWriter = null
        outputReader = null
    }

    private fun sendEvent(eventName: String, params: String?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
