package com.wildcode.chuck

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private lateinit var webView: WebView

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
    }

    inner class ChuckBridge {

        @JavascriptInterface
        fun sendMessage(message: String, callbackId: String) {
            thread {
                var reply = ""
                var error = ""

                try {
                    val connection = URL(
                        "https://chuck-ai-backend.onrender.com/ask"
                    ).openConnection() as HttpURLConnection

                    connection.requestMethod = "POST"
                    connection.connectTimeout = 20000
                    connection.readTimeout = 60000
                    connection.doOutput = true
                    connection.setRequestProperty(
                        "Content-Type",
                        "application/json"
                    )

                    val body = JSONObject()
                        .put("message", message)
                        .toString()

                    connection.outputStream.use {
                        it.write(body.toByteArray(Charsets.UTF_8))
                    }

                    val status = connection.responseCode
                    val stream = if (status in 200..299) {
                        connection.inputStream
                    } else {
                        connection.errorStream
                    }

                    val responseText = stream
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        ?: ""

                    if (status !in 200..299) {
                        throw Exception("Server returned $status")
                    }

                    reply = JSONObject(responseText)
                        .optString("reply", "")

                    if (reply.isBlank()) {
                        reply = "I didn't receive a response."
                    }

                    connection.disconnect()

                } catch (e: Exception) {
                    error = "Connection failed. Check your internet " +
                        "connection or try again shortly."
                }

                runOnUiThread {
                    val js = "window.onNativeReply(" +
                        "${JSONObject.quote(callbackId)}," +
                        "${JSONObject.quote(reply)}," +
                        "${JSONObject.quote(error)});"

                    webView.evaluateJavascript(js, null)
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("ChuckBridge")
        webView.destroy()
        super.onDestroy()
    }
}
