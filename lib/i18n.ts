/**
 * lib/i18n.ts
 *
 * Per-subscriber language support (UZ / EN).
 * Language is stored in cabinet_subscribers.lang for connected users,
 * or in bot_sessions.data.lang for anonymous users.
 */

import db from './turso';

export type Lang = 'uz' | 'en';

// ── Translation dictionary ────────────────────────────────────────────────────

const translations: Record<string, Record<Lang, string>> = {
    // ── Main menu & navigation ─────────────────────────────────────────────
    main_menu:              { uz: 'Asosiy menu',              en: 'Main menu' },
    back_button:            { uz: '⬅️ Orqaga',                en: '⬅️ Back' },
    menu_cabinet:           { uz: '📂 Kabinet',               en: '📂 Cabinet' },
    menu_check:             { uz: '🔍 Vizani tekshirish',     en: '🔍 Check' },
    menu_settings:          { uz: '⚙️ Sozlamalar',            en: '⚙️ Settings' },
    menu_fallback:          { uz: '👋 Pastdagi menudan bo\'limni tanlang yoki /help yuboring.', en: '👋 Select a section from the menu or send /help.' },

    // ── Settings ───────────────────────────────────────────────────────────
    settings_title:         { uz: '⚙️ *Sozlamalar*\n\nTilni tanlang:', en: '⚙️ *Settings*\n\nSelect language:' },
    settings_lang_uz:       { uz: '🇺🇿 O\'zbek tili', en: '🇺🇿 Uzbek' },
    settings_lang_en:       { uz: '🇬🇧 English', en: '🇬🇧 English' },
    settings_lang_changed_uz: { uz: '✅ Til o\'zgartirildi: O\'zbek', en: '✅ Language changed: Uzbek' },
    settings_lang_changed_en: { uz: 'English all set!', en: 'English all set!' },

    // ── Login flow ─────────────────────────────────────────────────────────
    login_title:            { uz: '⚠️ Agar siz konsaltingda ishlamasangiz va shunchaki vizangizni tekshirmoqchi bo\'lsangiz, kabinetni ulash shart emas — pastdagi *🔍 Vizani tekshirish* tugmasini bosing.\n\n🔒 *Consulting Kabinetiga kirish*\n\nEmail yoki Consulting nomini kiriting:', en: '⚠️ If you don\'t work at a consulting agency and just want to check your own visa result, you don\'t need to connect a cabinet — use the *🔍 Check* button below instead.\n\n🔒 *Cabinet Login*\n\nEnter your email or consulting name:' },
    login_email_short:      { uz: '⚠️ Email yoki Consulting nomini kiriting:', en: '⚠️ Enter your email or consulting name:' },
    login_password_prompt:  { uz: '🗝 Parolni kiriting:', en: '🗝 Enter your password:' },
    login_checking:         { uz: '⌛ *Tekshirilmoqda...*', en: '⌛ *Checking...*' },
    login_success:          { uz: '✅ *Muvaffaqiyatli ulandi!*', en: '✅ *Successfully connected!*' },
    login_error_prefix:     { uz: '❌ *Xatolik*\n\n', en: '❌ *Error*\n\n' },
    login_account_not_found:{ uz: 'Akkaunt topilmadi. Avval saytda ro\'yxatdan o\'ting.', en: 'Account not found. Please register on the website first.' },
    login_invalid_password: { uz: 'Parol noto\'g\'ri. Ma\'lumotlaringizni tekshiring.', en: 'Invalid password. Please check your credentials.' },

    // ── Cabinet connect / disconnect ───────────────────────────────────────
    cabinet_already_linked: { uz: '✅ Kabinet ulangan: *{username}*', en: '✅ Cabinet connected: *{username}*' },
    cabinet_connect_btn:    { uz: '🔑 Kabinetni ulash', en: '🔑 Connect Cabinet' },
    cabinet_disconnect_btn: { uz: '🔴 Chiqish', en: '🔴 Disconnect' },
    cabinet_disconnected:   { uz: '🔌 *Kabinet o\'chirildi.*', en: '🔌 *Cabinet disconnected.*' },
    profile_not_connected:  { uz: '⚠️ Profil ulanmagan.', en: '⚠️ Profile not connected.' },
    connect_first:          { uz: '⚠️ Quyidagi menyudan o\'zingiz ishlaydigan Consultingni ulang! Shunchaki vizani tekshirmoqchi bo\'lsangiz kabinetni ulash shart emas, Vizani tekshirish tugmasini bosing!.', en: '⚠️ Please connect a cabinet first (via ⚙ Settings).' },
    connect_first_slash:    { uz: '⚠️ Consulting Kabineti ulanmagan. Avval /cabinet orqali login va parollarni terib ulaning.', en: '⚠️ Cabinet not connected. Connect first via /cabinet.' },

    // ── Account info ───────────────────────────────────────────────────────
    account_not_connected:  { uz: '⚙ *Profilni boshqarish*\n\nHolat: 🛑 *Ulanmagan*\n\nVisaCheck kabinetini ulash uchun tugmani bosing:', en: '⚙ *Profile Management*\n\nStatus: 🛑 *Not connected*\n\nPress the button to connect your VisaCheck cabinet:' },
    account_info:           { uz: '⚙ *Consulting ma\'lumotlari*\n\n👤 *Consulting:* {username}\n📧 *Email:* `{email}`\n📅 *Ulangan sana:* {date}\n🎓 *Talabalar soni:* {count}\n🔄 *Holat:* Muvaffaqiyatli ulangan\n\nKabinetni o\'chirish uchun quyidagi tugmani bosing:', en: '⚙ *Account Details*\n\n👤 *Consulting:* {username}\n📧 *Email:* `{email}`\n📅 *Connected since:* {date}\n🎓 *Total students:* {count}\n🔄 *Status:* Connected\n\nPress the button below to disconnect:' },

    // ── Cabinet categories ─────────────────────────────────────────────────
    cabinet_categories:     { uz: '📂 *Kategoriyalar*\n\nKerakli bo\'limni tanlang:', en: '📂 *Categories*\n\nSelect a section:' },
    cat_pending:            { uz: 'Pending', en: 'Pending' },
    cat_approved:           { uz: 'Approved', en: 'Approved' },
    cat_cancelled:          { uz: 'Cancelled', en: 'Rejected' },
    cat_application:        { uz: 'Chopsu', en: 'Applications' },
    cabinet_header:         { uz: '📂 *Kabinet - {cat}* ({n} ta talaba)', en: '📂 *Cabinet - {cat}* ({n} students)' },
    cabinet_empty:          { uz: '📭 Bo\'limda talabalar topilmadi.', en: '📭 No students in this section.' },

    // ── Visa check flow ────────────────────────────────────────────────────
    check_type_prompt:      { uz: '✈️ *Visa turini tanlang*:', en: '✈️ *Select visa type*:' },
    check_passport_prompt:  { uz: '🔍 *Tezkor tekshirish*\n\nPasport raqamini kiriting (misol: FA1234567):', en: '🔍 *Quick Check*\n\nEnter passport number (e.g. AA1234567):' },
    check_passport_invalid: { uz: '⚠️ Pasport raqami xato. Misol: FA1234567. Qaytadan kiriting:', en: '⚠️ Invalid passport. Example: AA1234567. Try again:' },
    check_name_prompt:      { uz: '👤Xalqaro passportdagi Talabaning *Ism-familiyasi, otasining* ismini to\'liq kiriting (inglizcha, pasportdagidek):', en: '👤 Enter student\'s *Full Name* (in English, as in passport):' },
    check_name_short:       { uz: '⚠️ Ism juda qisqa. To\'liq kiriting:', en: '⚠️ Name too short. Enter full name:' },
    check_dob_prompt:       { uz: '📅 Talabaning *Tug\'ilgan kuni* (format: YYYY-MM-DD, misol: 2005-03-18):', en: '📅 Student\'s *Date of Birth* (format: YYYY-MM-DD, e.g. 2005-03-18):' },
    check_dob_invalid:      { uz: '⚠️ Sana xato. Format: YYYY-MM-DD (misol: 2005-03-18):', en: '⚠️ Invalid date. Format: YYYY-MM-DD (e.g. 2005-03-18):' },
    check_appno_prompt:     { uz: '📄 E-Visa ariza raqamini kiriting (misol: 5555550001):', en: '📄 Enter E-Visa application number (e.g. 6595150001):' },
    check_appno_invalid:    { uz: '⚠️ Ariza raqami xato. Qaytadan kiriting:', en: '⚠️ Invalid application number. Try again:' },
    check_waiting:          { uz: '⌛ *Kutib turing...*', en: '⌛ *Please wait...*' },
    check_error:            { uz: '❌ *Tekshirish xatosi:* {error}', en: '❌ *Check error:* {error}' },

    // ── Autofill ───────────────────────────────────────────────────────────
    autofill_found:         { uz: '🔍 *Bazadan bu passportga tegishli Ma\'lumot topildi*\n\nPasport *{passport}*. Quyidagi ma\'lumot to\'g\'rimi?', en: '🔍 *Record found*\n\nA student was found for passport *{passport}*. Is this them?' },
    autofill_manual_btn:    { uz: '👤 Qo\'lda kiritish', en: '👤 Enter manually' },
    autofill_confirm:       { uz: '🔍 *Ma\'lumotlarni tekshiring*\n\n👤 *Ism:* {name}\n📅 *Tug\'ilgan sana:* {dob}\n✈️ *Visa turi:* {visaType}\n\n*Ma\'lumotlar to\'g\'rimi?*', en: '🔍 *Verify details*\n\n👤 *Name:* {name}\n📅 *Date of Birth:* {dob}\n✈️ *Visa type:* {visaType}\n\n*Are the details correct?*' },
    btn_yes:                { uz: '✅ Ha', en: '✅ Yes' },
    btn_no:                 { uz: '❌ Yo\'q', en: '❌ No' },

    // ── Results ────────────────────────────────────────────────────────────
    no_result:              { uz: '🚫 Natija yo\'q\n\nPasport, Ism va Tug\'ilgan kunni tekshiring', en: '🚫 No result\n\nCheck the Passport, Name and Date of Birth' },
    check_error_generic:    { uz: '❌ *Tekshirish xatosi:* {error}', en: '❌ *Check error:* {error}' },

    // ── Refresh ────────────────────────────────────────────────────────────
    refreshing:             { uz: '🔄 *Tekshirilmoqda...*', en: '🔄 *Checking...*' },
    refresh_error:          { uz: '❌ Yangilash xatosi: {error}', en: '❌ Refresh error: {error}' },
    no_change:              { uz: '{name}\nAfsuski o\'zgarish yo\'q 🤷🏻', en: '{name}\nNo change 🤷🏻' },
    passport_not_found:     { uz: '❌ Pasport topilmadi. Qaytadan /check orqali qidiring.', en: '❌ Passport not found. Search again via /check.' },
    btn_refresh:            { uz: '🔄 Yangilash', en: '🔄 Refresh' },

    // ── PDF ────────────────────────────────────────────────────────────────
    pdf_loading:            { uz: '⏳ *Viza yuklab olinmoqda...*\n_Iltimos kutib turing, visa.go.kr portaliga so\'rov yuborilmoqda..._', en: '⏳ *Downloading certificate...*\n_Please wait, sending request to visa.go.kr portal..._' },
    pdf_no_student:         { uz: '❌ Talaba ma\'lumotlari topilmadi. Avval statusni tekshiring.', en: '❌ Student data not found. Check status first.' },
    pdf_caption:            { uz: '📄 *Koreya vizasi* ({passport})', en: '📄 *Korea Visa Certificate* ({passport})' },
    pdf_error:              { uz: '❌ *Vizani yuklab bo\'lmadi:* {error}', en: '❌ *Could not download certificate:* {error}' },
    btn_pdf:                { uz: '📥 Viza (pdf)', en: '📥 Visa (pdf)' },

    // ── Save to cabinet ────────────────────────────────────────────────────
    save_prompt:            { uz: '💾 Bu talaba Consulting kabinetga saqlansinmi?', en: '💾 Save this student to cabinet?' },
    save_no:                { uz: '📝 Kabinetga saqlanmadi.', en: '📝 Not saved to cabinet.' },
    save_data_missing:      { uz: '⚠️ Ma\'lumot topilmadi. Qaytadan tekshiring.', en: '⚠️ Data not found. Try again.' },
    save_updated:           { uz: '✅ *{passport}* Consulting kabinetda yangilandi.', en: '✅ *{passport}* updated in cabinet.' },
    save_restored:          { uz: '✅ *{passport}* Consulting kabinetga qayta qo\'shildi.', en: '✅ *{passport}* re-added to cabinet.' },
    save_saved:             { uz: '✅ *{passport}* Consulting kabinetga saqlandi!', en: '✅ *{passport}* saved to cabinet!' },
    save_error:             { uz: '❌ Saqlashda xatolik: {error}', en: '❌ Save error: {error}' },

    // ── Keyboards ─────────────────────────────────────────────────────────
    visa_type_embassy:      { uz: 'Elchixona orqali', en: 'Embassy' },
    visa_type_evisa:        { uz: 'Elektron (E-Visa)', en: 'Electronic (E-Visa)' },
    tab_pending:            { uz: '⏳ Kutilmoqda', en: '⏳ Pending' },
    tab_application:        { uz: '📄 Arizalar', en: '📄 Applications' },
    tab_cancelled:          { uz: '❌ Rad etildi', en: '❌ Rejected' },
    tab_approved:           { uz: '🟢 Tasdiqlandi', en: '🟢 Approved' },

    // ── Welcome / help ─────────────────────────────────────────────────────
    welcome:    {
        uz: 'Viza arizalarini tekshirish botiga xush kelibsiz! 🇰🇷🤖\n\nMenudan foydalaning.',
        en: 'Welcome to the Korea Visa Checker bot! 🇰🇷🤖\n\nFeatures:\n• Connect your VisaCheck cabinet\n• Track student visa statuses\n• Receive status change notifications\n• Quick manual visa check\n\nUse the menu below.'
    },
    help: {
        uz: 'ℹ️ *Bot bo\'yicha qo\'llanma*\n\n*Buyruqlar:*\n/start - Botni boshlash\n/cabinet - Kabinetni ulash\n/check - Visani tekshirish\n/help - Yordam menyusi\n\n*Menyular:*\n📂 *Kabinet* - Talabalar ro\'yxati\n🔍 *Tekshirish* - Visani to\'g\'ridan-to\'g\'ri tekshirish\n⚙ *Consulting* - Sozlamalar va chiqish\n\nSavollar uchun administratorga murojaat qiling. Admin: @khan0200',
        en: 'ℹ️ *Bot Guide*\n\n*Commands:*\n/start - Start the bot\n/cabinet - Connect cabinet\n/check - Check visa status\n/help - Help menu\n\n*Menu:*\n📂 *Cabinet* - Student list\n🔍 *Check* - Direct visa check\n⚙ *Consulting* - Settings & disconnect\n\nContact the administrator for support.'
    },

    // ── Notification (visa status change) ─────────────────────────────────
    notif_title:            { uz: '🔍 *Visa statusini tekshirish*', en: '🔍 *Visa Status Check*' },
    notif_visa_type:        { uz: '✈️ *Visa turi:*', en: '✈️ *Visa type:*' },
    notif_partner:          { uz: '🏢 *Taklif:*', en: '🏢 *Partner:*' },
    notif_app_no:           { uz: '📄 *Ariza raqami:*', en: '📄 *Application No:*' },
    notif_submitted:        { uz: '📅 *Topshirilgan sana:*', en: '📅 *Submitted date:*' },
    notif_status:           { uz: '🔄 *Holati:*', en: '🔄 *Status:*' },
    notif_checked:          { uz: 'Tekshirildi:', en: 'Checked:' },
    notif_result:           { uz: '*Natija:*', en: '*Result:*' },
    notif_reason:           { uz: '⚠️ *Sababi:*', en: '⚠️ *Reason:*' },
    notif_prev_reason:      { uz: 'Bundan oldingi ariza natijasi:\n🚫 Sababi:', en: 'Previous application result:\n🚫 Reason:' },
    notif_na:               { uz: 'N/A', en: 'N/A' },
    notif_pdf_link:         { uz: 'Vizani yuklash', en: 'Download visa' },
};

// ── Translate function ────────────────────────────────────────────────────────

/**
 * Translates a key to the given language.
 * Supports simple template variables: t('key', 'en', { name: 'John' })
 */
export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
    const entry = translations[key];
    if (!entry) return key;
    let text = entry[lang] ?? entry['uz'] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
    }
    return text;
}

// ── Language persistence ──────────────────────────────────────────────────────

/**
 * Gets the preferred language for a Telegram user.
 * Checks cabinet_subscribers first (connected users), falls back to bot_sessions.
 */
export async function getLang(telegramId: number): Promise<Lang> {
    try {
        // Check cabinet_subscribers (connected cabinet users)
        const csRes = await db.execute({
            sql: 'SELECT lang FROM cabinet_subscribers WHERE telegram_id = ?',
            args: [telegramId]
        });
        if (csRes.rows.length > 0) {
            const lang = csRes.rows[0].lang as string;
            if (lang === 'en') return 'en';
            return 'uz';
        }

        // Fallback: check bot_sessions.data.lang
        const bsRes = await db.execute({
            sql: 'SELECT data FROM bot_sessions WHERE telegram_id = ?',
            args: [telegramId]
        });
        if (bsRes.rows.length > 0) {
            const data = JSON.parse((bsRes.rows[0].data as string) || '{}');
            if (data._lang === 'en') return 'en';
        }
    } catch (_) {}
    return 'uz';
}

/**
 * Saves the preferred language for a Telegram user.
 */
export async function setLang(telegramId: number, lang: Lang): Promise<void> {
    try {
        // If the user is connected to a cabinet, store in cabinet_subscribers
        const csRes = await db.execute({
            sql: 'SELECT id FROM cabinet_subscribers WHERE telegram_id = ?',
            args: [telegramId]
        });
        if (csRes.rows.length > 0) {
            await db.execute({
                sql: 'UPDATE cabinet_subscribers SET lang = ? WHERE telegram_id = ?',
                args: [lang, telegramId]
            });
            return;
        }

        // Otherwise store in bot_sessions.data
        const bsRes = await db.execute({
            sql: 'SELECT data FROM bot_sessions WHERE telegram_id = ?',
            args: [telegramId]
        });
        const existing = bsRes.rows.length > 0
            ? JSON.parse((bsRes.rows[0].data as string) || '{}')
            : {};
        existing._lang = lang;

        await db.execute({
            sql: `INSERT INTO bot_sessions (telegram_id, state, data)
                  VALUES (?, 'idle', ?)
                  ON CONFLICT(telegram_id) DO UPDATE SET data = excluded.data`,
            args: [telegramId, JSON.stringify(existing)]
        });
    } catch (err: any) {
        console.error('[i18n] setLang error:', err.message);
    }
}
