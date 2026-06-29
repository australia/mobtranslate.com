package com.mobtranslate.keyboard

import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.inputmethodservice.InputMethodService
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The MobTranslate keyboard (an Android IME).
 *
 * Three things make it useful for First Nations typing:
 *  1. Orthography keys — language-specific digraphs/retroflexes (ng, ngw, nj, rr,
 *     rd, rn, ly, …) that a normal keyboard hides.
 *  2. A suggestion bar — as you type an English word it offers the Aboriginal
 *     word; tap it and it replaces the English word, in WhatsApp or any app.
 *  3. A language switch — cycle Kuku Yalanji / Anindilyakwa / Wajarri / Mi'gmaq.
 *
 * Privacy: suggestions are looked up in a bundled offline dictionary; what you
 * type never leaves the device.
 */
class MobKeyboardService : InputMethodService() {

    // ---- palette -----------------------------------------------------------
    private val kbBg = 0xFFE7E0D8.toInt()
    private val keyBg = 0xFFFFFFFF.toInt()
    private val keyPressed = 0xFFE0D6CC.toInt()
    private val keyText = 0xFF24201D.toInt()
    private val fnBg = 0xFFCFC5BA.toInt()
    private val fnPressed = 0xFFBDB2A6.toInt()
    private val accent = 0xFFB45E2A.toInt()
    private val accentPressed = 0xFF8E481F.toInt()
    private val hintText = 0xFF6B6259.toInt()

    private var langIndex = 0
    private val lang get() = Languages.ALL[langIndex]
    private var shift = false

    private lateinit var suggestionBar: LinearLayout
    private lateinit var specialsRow: LinearLayout
    private val letterKeys = ArrayList<TextView>()

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /**
     * Keep the bottom row clear of the system navigation bar / gesture pill.
     * Pads the keyboard's bottom by the navigation-bar inset (with a resource
     * fallback for when the inset listener hasn't fired yet).
     */
    private fun applyBottomInset(root: LinearLayout) {
        val basePad = dp(6)
        val navResId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
        val navFallback = if (navResId > 0) resources.getDimensionPixelSize(navResId) else dp(28)
        root.setPadding(root.paddingLeft, root.paddingTop, root.paddingRight, basePad + navFallback)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val pad = if (nav > 0) nav else navFallback
            v.setPadding(v.paddingLeft, v.paddingTop, v.paddingRight, basePad + pad)
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    override fun onCreateInputView(): View {
        letterKeys.clear()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(kbBg)
            setPadding(dp(3), dp(4), dp(3), dp(6))
        }
        applyBottomInset(root)

        // Suggestion / language bar (horizontally scrollable).
        suggestionBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val scroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            layoutParams = LinearLayout.LayoutParams(MATCH, dp(46))
            addView(suggestionBar)
        }
        root.addView(scroll)

        val rows = listOf(
            listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
            listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        )
        rows.forEach { root.addView(letterRow(it)) }

        // Shift + bottom letter row + backspace.
        val row3 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row3.addView(fnKey("⇧", 1.5f) { toggleShift() })
        listOf("z", "x", "c", "v", "b", "n", "m").forEach { row3.addView(letterKey(it)) }
        row3.addView(fnKey("⌫", 1.5f) { backspace() })
        root.addView(row3)

        // Language-specific orthography keys.
        specialsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        root.addView(specialsRow)
        rebuildSpecialsRow()

        // Function row.
        val row5 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row5.addView(fnKey("🌐", 1.4f) { showImePicker() })
        row5.addView(charKey(",", 1f, fnBg, fnPressed))
        row5.addView(charKey(" ", 5f, keyBg, keyPressed, label = "space"))
        row5.addView(charKey(".", 1f, fnBg, fnPressed))
        row5.addView(fnKey("⏎", 1.8f) { enter() })
        root.addView(row5)

        renderSuggestions(emptyList(), emptyList())
        return root
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        shift = false
        applyShiftToLabels()
        if (!::suggestionBar.isInitialized) return
        // Warm the indexes off the UI thread, then refresh.
        Thread {
            EnglishLexicon.ensureLoaded(applicationContext)
            Dictionary.preload(applicationContext, lang.code)
            suggestionBar.post { refreshSuggestions() }
        }.start()
    }

    override fun onUpdateSelection(
        oldSelStart: Int, oldSelEnd: Int,
        newSelStart: Int, newSelEnd: Int,
        candidatesStart: Int, candidatesEnd: Int,
    ) {
        super.onUpdateSelection(
            oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd,
        )
        refreshSuggestions()
    }

    // ---- key rows ----------------------------------------------------------
    private fun letterRow(chars: List<String>): LinearLayout {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        chars.forEach { row.addView(letterKey(it)) }
        return row
    }

    private fun letterKey(ch: String): TextView {
        val tv = baseKey(ch, 1f, keyBg, keyPressed)
        tv.setOnClickListener {
            commit(if (shift) ch.uppercase() else ch)
            if (shift) { shift = false; applyShiftToLabels() }
        }
        letterKeys.add(tv)
        return tv
    }

    /** A key that commits its own label verbatim (digraphs, punctuation, space). */
    private fun charKey(
        text: String, weight: Float, bg: Int, pressed: Int, label: String = text,
    ): TextView {
        val tv = baseKey(label, weight, bg, pressed)
        tv.setOnClickListener { commit(text) }
        return tv
    }

    private fun fnKey(label: String, weight: Float, onClick: () -> Unit): TextView {
        val tv = baseKey(label, weight, fnBg, fnPressed)
        tv.setOnClickListener { onClick() }
        return tv
    }

    private fun baseKey(label: String, weight: Float, bg: Int, pressed: Int): TextView =
        TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            textSize = 18f
            setTextColor(keyText)
            background = pillBg(bg, pressed)
            isClickable = true
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(0, dp(46), weight).apply {
                setMargins(dp(2), dp(3), dp(2), dp(3))
            }
        }

    private fun pillBg(normal: Int, pressed: Int): StateListDrawable {
        fun solid(c: Int) = GradientDrawable().apply {
            setColor(c); cornerRadius = dp(7).toFloat()
        }
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), solid(pressed))
            addState(intArrayOf(), solid(normal))
        }
    }

    private fun rebuildSpecialsRow() {
        specialsRow.removeAllViews()
        lang.specialKeys.forEach { sp ->
            specialsRow.addView(
                baseKey(sp, 1f, fnBg, fnPressed).apply {
                    setTextColor(accent)
                    setTypeface(typeface, Typeface.BOLD)
                    setOnClickListener { commit(sp) }
                },
            )
        }
    }

    // ---- editing -----------------------------------------------------------
    private fun commit(text: String) {
        currentInputConnection?.commitText(text, 1)
        refreshSuggestions()
    }

    private fun backspace() {
        val ic = currentInputConnection ?: return
        val selected = ic.getSelectedText(0)
        if (selected.isNullOrEmpty()) ic.deleteSurroundingText(1, 0) else ic.commitText("", 1)
        refreshSuggestions()
    }

    private fun enter() {
        val ic = currentInputConnection ?: return
        val opts = currentInputEditorInfo?.imeOptions ?: 0
        val action = opts and EditorInfo.IME_MASK_ACTION
        if (action != EditorInfo.IME_ACTION_NONE &&
            (opts and EditorInfo.IME_FLAG_NO_ENTER_ACTION) == 0
        ) {
            ic.performEditorAction(action)
        } else {
            ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
            ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        }
    }

    private fun toggleShift() {
        shift = !shift
        applyShiftToLabels()
    }

    private fun applyShiftToLabels() {
        letterKeys.forEach { tv ->
            val base = tv.text.toString()
            tv.text = if (shift) base.uppercase() else base.lowercase()
        }
    }

    private fun showImePicker() {
        getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
    }

    // ---- suggestions -------------------------------------------------------
    private fun currentWordBeforeCursor(): String {
        val ic = currentInputConnection ?: return ""
        val before = ic.getTextBeforeCursor(48, 0)?.toString() ?: return ""
        // The English word being typed = trailing run of letters.
        val sb = StringBuilder()
        for (i in before.length - 1 downTo 0) {
            val c = before[i]
            if (c.isLetter()) sb.append(c) else break
        }
        return sb.reverse().toString()
    }

    private fun refreshSuggestions() {
        if (!::suggestionBar.isInitialized) return
        val word = currentWordBeforeCursor()
        if (word.length < 2) {
            renderSuggestions(emptyList(), emptyList())
            return
        }

        // English completions / typo fixes — makes it feel like a normal keyboard.
        val english = EnglishLexicon.suggest(word, 3)

        // A couple of translations: of the typed word and its top English fixes.
        val translations = ArrayList<Suggestion>()
        val seen = HashSet<String>()
        val candidates = ArrayList<String>().apply { add(word); addAll(english) }
        for (c in candidates) {
            for (s in Dictionary.lookup(applicationContext, lang.code, c, limit = 3, allowPrefix = false)) {
                if (seen.add(s.target)) {
                    translations.add(s)
                    if (translations.size >= 2) break
                }
            }
            if (translations.size >= 2) break
        }

        renderSuggestions(english, translations)
    }

    private fun replaceWordWith(target: String, thenRefresh: Boolean) {
        val ic = currentInputConnection ?: return
        val word = currentWordBeforeCursor()
        ic.beginBatchEdit()
        if (word.isNotEmpty()) ic.deleteSurroundingText(word.length, 0)
        ic.commitText(target, 1)
        ic.endBatchEdit()
        if (thenRefresh) refreshSuggestions() else renderSuggestions(emptyList(), emptyList())
    }

    private fun chip(
        label: String, bg: Int, pressed: Int, textColor: Int, big: Boolean, onClick: () -> Unit,
    ): TextView = TextView(this).apply {
        text = label
        setTextColor(textColor)
        if (big) setTypeface(typeface, Typeface.BOLD)
        textSize = if (big) 15f else 14f
        gravity = Gravity.CENTER
        setPadding(dp(14), dp(7), dp(14), dp(7))
        background = pillBg(bg, pressed)
        isClickable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).apply {
            setMargins(dp(3), dp(2), dp(3), dp(2))
        }
    }

    private fun renderSuggestions(english: List<String>, translations: List<Suggestion>) {
        suggestionBar.removeAllViews()

        // Pinned language chip — tap to cycle languages.
        suggestionBar.addView(
            chip("${lang.name}  ▾", 0x22B45E2A, 0x44B45E2A, accent, big = false) { cycleLanguage() }
                .apply {
                    textSize = 13f
                    (layoutParams as LinearLayout.LayoutParams).setMargins(dp(4), dp(2), dp(8), dp(2))
                },
        )

        if (english.isEmpty() && translations.isEmpty()) {
            suggestionBar.addView(
                TextView(this).apply {
                    text = "type — corrections and ${lang.name} translations appear here"
                    setTextColor(hintText)
                    textSize = 12f
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(4), 0, dp(8), 0)
                    layoutParams = LinearLayout.LayoutParams(WRAP, MATCH)
                },
            )
            return
        }

        // English suggestions first (neutral) — completion / typo fix.
        english.forEach { w ->
            suggestionBar.addView(
                chip(w, keyBg, keyPressed, keyText, big = false) { replaceWordWith(w, thenRefresh = true) },
            )
        }

        // Then the translations (accent) — tap to insert the Aboriginal word.
        translations.forEach { s ->
            suggestionBar.addView(
                chip(s.target, accent, accentPressed, 0xFFFFFFFF.toInt(), big = true) {
                    replaceWordWith(s.target, thenRefresh = false)
                },
            )
        }
    }

    private fun cycleLanguage() {
        langIndex = (langIndex + 1) % Languages.ALL.size
        rebuildSpecialsRow()
        Thread {
            Dictionary.preload(applicationContext, lang.code)
            suggestionBar.post { refreshSuggestions() }
        }.start()
    }

    companion object {
        private const val MATCH = LinearLayout.LayoutParams.MATCH_PARENT
        private const val WRAP = LinearLayout.LayoutParams.WRAP_CONTENT
    }
}
