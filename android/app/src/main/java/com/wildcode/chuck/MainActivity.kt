package com.wildcode.chuck

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var webView: WebView

    // One background thread owns the local AI engine.
    private val aiExecutor = Executors.newSingleThreadExecutor()

    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private var engineReady = false
    private var shuttingDown = false

    private val modelName = "gemma3-1b-it-int4.litertlm"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()

        webView.addJavascriptInterface(
            ChuckBridge(),
            "ChuckBridge"
        )

        setContentView(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(
                "file:///android_asset/www/index.html"
            )
        }

        // Load Gemma off the main UI thread.
        aiExecutor.execute {
            initializeLocalAI()
        }
    }

    private fun initializeLocalAI() {
        val modelFile = File(filesDir, modelName)

        if (!modelFile.exists() || modelFile.length() == 0L) {
            android.util.Log.w(
                "CHUCK",
                "Local model missing: ${modelFile.absolutePath}"
            )
            return
        }

        var candidate: Engine? = null

        try {
            val config = EngineConfig(
                modelPath = modelFile.absolutePath,
                backend = Backend.CPU(),
                cacheDir = cacheDir.absolutePath
            )

            candidate = Engine(config)
            candidate.initialize()

            val newConversation = candidate.createConversation()

            // Keep the engine only after successful initialization.
            engine = candidate
            conversation = newConversation
            engineReady = true

            android.util.Log.i(
                "CHUCK",
                "Local Gemma model initialized successfully."
            )

        } catch (e: Exception) {
            android.util.Log.e(
                "CHUCK",
                "Local AI initialization failed",
                e
            )

            // Only close an engine that initialized successfully.
            // An engine whose initialize() failed must not be closed.
            if (engine === candidate) {
                try {
                    conversation?.close()
                } catch (_: Exception) {
                }

                conversation = null
                engine = null
                engineReady = false

                try {
                    candidate?.close()
                } catch (_: Exception) {
                }
            }

            // If initialization failed, candidate was never assigned
            // to engine, so don't call close() on it.
        }
    }

    inner class ChuckBridge {

        @JavascriptInterface
        fun sendMessage(message: String, callbackId: String) {
            aiExecutor.execute {
                var reply = ""
                var error = ""

                try {
                    if (shuttingDown) {
                        throw Exception("CHUCK is shutting down.")
                    }

                    if (message.isBlank()) {
                        throw Exception("Please enter a message.")
                    }

                    if (!engineReady || conversation == null) {
                        val modelFile = File(filesDir, modelName)

                        if (!modelFile.exists()) {
                            throw Exception(
                                "Gemma is not installed yet. " +
                                "The local model file is missing. " +
                                "We need to install the model before " +
                                "CHUCK can answer offline."
                            )
                        }

                        throw Exception(
                            "The local AI did not initialize. " +
                            "Check the Android build logs."
                        )
                    }

                    // Generate the response directly on this device.
                    reply = conversation!!
                        .sendMessage(message)
                        .toString()

                    if (reply.isBlank()) {
                        throw Exception(
                            "Gemma returned an empty response."
                        )
                    }

                } catch (e: Exception) {
                    error = e.message
                        ?: "An error occurred while running local AI."

                    android.util.Log.e(
                        "CHUCK",
                        "Message processing failed",
                        e
                    )
                }

                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        val js = "window.onNativeReply(" +
                            "${JSONObject.quote(callbackId)}," +
                            "${JSONObject.quote(reply)}," +
                            "${JSONObject.quote(error)});"

                        webView.evaluateJavascript(js, null)
                    }
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        shuttingDown = true

        webView.removeJavascriptInterface("ChuckBridge")
        webView.destroy()

        // Release resources on the same executor that owns them.
        aiExecutor.execute {
            try {
                conversation?.close()
            } catch (e: Exception) {
                android.util.Log.e(
                    "CHUCK",
                    "Conversation cleanup failed",
                    e
                )
            } finally {
                conversation = null
            }

            try {
                engine?.close()
            } catch (e: Exception) {
                android.util.Log.e(
                    "CHUCK",
                    "Engine cleanup failed",
                    e
                )
            } finally {
                engine = null
                engineReady = false
            }
        }

        aiExecutor.shutdown()

        super.onDestroy()
    }
}
