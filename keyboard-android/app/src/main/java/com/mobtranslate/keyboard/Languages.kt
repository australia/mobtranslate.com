package com.mobtranslate.keyboard

/**
 * The languages the keyboard supports. `code` matches the bundled dictionary
 * asset (assets/dictionary/<code>.json) and the MobTranslate dictionary code.
 * `specialKeys` are the orthography graphemes that aren't single QWERTY letters
 * — the digraphs and retroflexes a typist needs but a normal keyboard hides.
 */
data class KbLanguage(
    val code: String,
    val name: String,
    val specialKeys: List<String>,
)

object Languages {
    val ALL: List<KbLanguage> = listOf(
        KbLanguage(
            code = "kuku_yalanji",
            name = "Kuku Yalanji",
            specialKeys = listOf("ng", "ny", "rr", "dy", "'"),
        ),
        KbLanguage(
            // Eastern Gunwinyguan: labialised velars + palatal nasal + retroflexes.
            code = "anindilyakwa",
            name = "Anindilyakwa",
            specialKeys = listOf("ng", "ngw", "kw", "nj", "rr", "rd", "rn", "ly"),
        ),
        KbLanguage(
            code = "wbv",
            name = "Wajarri",
            specialKeys = listOf("ng", "ny", "rr", "rd", "rn", "rl"),
        ),
        KbLanguage(
            // Mi'gmaq (Listuguj orthography) leans on the apostrophe for schwa.
            code = "migmaq",
            name = "Mi'gmaq",
            specialKeys = listOf("'", "g'", "gw", "kw", "q"),
        ),
    )

    fun byCode(code: String): KbLanguage = ALL.firstOrNull { it.code == code } ?: ALL[0]
}
