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

            val binaryFile = File(engineDir, "stockfish")
            
            // Extract binary from assets
            reactApplicationContext.assets.open("stockfish/stockfish").use { input ->
                FileOutputStream(binaryFile).use { output ->
                    input.copyTo(output)
                }
            }

            // Extract NNUE files
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

            // Set executable permission
            binaryFile.setExecutable(true)
            promise.resolve(binaryFile.absolutePath)
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
            val binaryFile = File(reactApplicationContext.filesDir, "stockfish/stockfish")
            process = ProcessBuilder(binaryFile.absolutePath)
                .directory(binaryFile.parentFile)
                .redirectErrorStream(true)
                .start()

            outputReader = BufferedReader(InputStreamReader(process?.inputStream))
            inputWriter = BufferedWriter(OutputStreamWriter(process?.outputStream))
            isRunning = true

            // Start reading output in a separate thread
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
