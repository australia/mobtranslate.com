package com.mobtranslate.keyboard

import android.content.Context
import org.json.JSONObject

/** One English -> Aboriginal-language candidate. */
data class Suggestion(val target: String, val gloss: String)

/**
 * Loads the bundled offline index (assets/dictionary/<code>.json) and answers
 * English-word lookups. Everything is local — typing never leaves the device.
 *
 * The index is built from the live MobTranslate dictionary by tools/build_dict.py.
 * Per language it maps an English keyword to ranked candidate target words.
 */
object Dictionary {

    private val cache = HashMap<String, Map<String, List<Suggestion>>>()

    private fun load(context: Context, code: String): Map<String, List<Suggestion>> {
        cache[code]?.let { return it }
        val map = LinkedHashMap<String, List<Suggestion>>()
        try {
            val json = context.assets.open("dictionary/$code.json")
                .bufferedReader(Charsets.UTF_8)
                .use { it.readText() }
            val entries = JSONObject(json).optJSONObject("entries") ?: JSONObject()
            val keys = entries.keys()
            while (keys.hasNext()) {
                val english = keys.next()
                val arr = entries.optJSONArray(english) ?: continue
                val list = ArrayList<Suggestion>(arr.length())
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val w = o.optString("w")
                    if (w.isNotEmpty()) list.add(Suggestion(w, o.optString("g")))
                }
                if (list.isNotEmpty()) map[english] = list
            }
        } catch (_: Exception) {
            // Missing/blank asset -> empty index; the keyboard still types fine.
        }
        cache[code] = map
        return map
    }

    /** Pre-warm a language's index off the UI thread. */
    fun preload(context: Context, code: String) {
        load(context, code)
    }

    /**
     * Suggestions for the English word currently being typed. Exact matches win;
     * if there are none we offer a few prefix matches so candidates appear while
     * the user is still typing.
     */
    fun lookup(context: Context, code: String, rawWord: String, limit: Int = 6): List<Suggestion> {
        val word = rawWord.trim().lowercase()
        if (word.length < 2) return emptyList()
        val index = load(context, code)

        index[word]?.let { return it.take(limit) }

        // Prefix fallback (linear scan; the indexes are only a few thousand keys).
        val out = ArrayList<Suggestion>()
        val seen = HashSet<String>()
        for ((english, list) in index) {
            if (english.startsWith(word)) {
                for (s in list) {
                    if (seen.add(s.target)) {
                        out.add(s)
                        if (out.size >= limit) return out
                    }
                }
            }
        }
        return out
    }
}
