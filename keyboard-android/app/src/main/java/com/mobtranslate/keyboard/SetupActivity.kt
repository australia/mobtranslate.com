package com.mobtranslate.keyboard

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.view.inputmethod.InputMethodManager

/**
 * Simple launcher screen: explains how to turn the keyboard on and switch to it,
 * with a text box to try it out. No XML layout — kept dependency-free.
 */
class SetupActivity : Activity() {

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val accent = 0xFFB45E2A.toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(32), dp(24), dp(32))
        }

        fun heading(t: String) = TextView(this).apply {
            text = t; textSize = 24f; setTextColor(Color.BLACK)
            setPadding(0, 0, 0, dp(8))
        }
        fun body(t: String) = TextView(this).apply {
            text = t; textSize = 15f; setTextColor(0xFF44403B.toInt())
            setPadding(0, dp(4), 0, dp(4))
        }
        fun primary(t: String, onClick: () -> Unit) = Button(this).apply {
            text = t; setTextColor(Color.WHITE); setBackgroundColor(accent)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(52),
            ).apply { topMargin = dp(12) }
        }

        root.addView(heading("MobTranslate Keyboard"))
        root.addView(body("Type Aboriginal-language words anywhere — WhatsApp, messages, notes. Type an English word and tap the translation to swap it in. Includes the special letters each language needs (ng, ngw, nj, rr, rd …)."))

        root.addView(body("\n1.  Turn the keyboard on in Settings."))
        root.addView(primary("Enable in Settings") {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        })

        root.addView(body("\n2.  Switch your active keyboard to MobTranslate."))
        root.addView(primary("Switch keyboard") {
            getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
        })

        root.addView(body("\n3.  Try it here:"))
        root.addView(EditText(this).apply {
            hint = "Tap here and type, e.g. \"water\""
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) }
        })

        root.addView(TextView(this).apply {
            text = "\nPrivacy: suggestions come from an offline dictionary on your phone. What you type never leaves the device."
            textSize = 12f; setTextColor(0xFF8A8178.toInt())
            setPadding(0, dp(16), 0, 0)
        })

        setContentView(ScrollView(this).apply { addView(root) })
    }
}
