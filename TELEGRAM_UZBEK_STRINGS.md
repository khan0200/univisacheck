# All Uzbek strings used by the Telegram bot

The bot has two separate implementations that both send Telegram messages:

1. **`lib/i18n.ts`** — the real bilingual (UZ/EN) bot (`bot/*.ts`, `api/telegram.ts`, `api/webhook.ts`). This is where nearly all user-facing text lives, in one place, as `{ uz: '...', en: '...' }` pairs. **Start here — this is 95% of what needs polishing.**
2. **`proxy.js`** / **`api/notify-telegram.js`** — the outbound "status changed" notification sent from the web app (not the conversational bot). Has its own separate, partially-duplicated Uzbek strings.

Plus a few stray hardcoded strings living outside the dictionary (listed at the end) — those need to be moved into `i18n.ts` (or fixed to actually use it) if you want everything centralized.

---

## 1. `lib/i18n.ts` — main dictionary (edit these directly)

File: `lib/i18n.ts`, lines 17–137. Each row is `key: { uz: '...', en: '...' }` — only the `uz` value needs polishing; `en` is shown for context.

### Main menu & navigation
| Key | Current `uz` value |
|---|---|
| `main_menu` | `Asosiy menu` |
| `back_button` | `⬅️ Orqaga` |
| `menu_cabinet` | `📂 Kabinet` |
| `menu_check` | `🔍 Vizani tekshirish` |
| `menu_settings` | `⚙️ Sozlamalar` |
| `menu_fallback` | `👋 Pastdagi menudan bo'limni tanlang yoki /help yuboring.` |

### Settings
| Key | Current `uz` value |
|---|---|
| `settings_title` | `⚙️ *Sozlamalar*\n\nTilni tanlang:` |
| `settings_lang_uz` | `🇺🇿 O'zbek tili` |
| `settings_lang_en` | `🇬🇧 English` |
| `settings_lang_changed_uz` | `✅ Til o'zgartirildi: O'zbek` |
| `settings_lang_changed_en` | `English all set!`

### Login flow
| Key | Current `uz` value |
|---|---|
| `login_title` | `🔒 *Siz Koreya konsaltingda ishlaysizmi? Consulting Kabinetiga kirish*\n\nEmail yoki Consulting nomini kiriting:` |
NEW: agar siz shunchaki vizani tekshirmoqchi bo'lsangiz, konsalting kabinetiga kirishingiz shart emas!
| `login_email_short` | `⚠️ Email yoki Consulting nomini kiriting:` |
| `login_password_prompt` | `🗝 Parolni kiriting:` |
| `login_checking` | `⌛ *Tekshirilmoqda...*` |
| `login_success` | `✅ *Muvaffaqiyatli ulandi!*` |
| `login_error_prefix` | `❌ *Xatolik*\n\n` |

### Cabinet connect / disconnect
| Key | Current `uz` value |
|---|---|
| `cabinet_already_linked` | `✅ Kabinet ulangan: *{username}*` |
| `cabinet_connect_btn` | `🔑 Kabinetni ulash` |
| `cabinet_disconnect_btn` | `🔴 Chiqish` |
| `cabinet_disconnected` | `🔌 *Kabinet o'chirildi.*` |
| `profile_not_connected` | `⚠️ Profil ulanmagan.` |
| `connect_first` | `⚠️ Quyidagi menyudan o'zingiz ishlaydigan Consultingni ulang! Shunchaki vizani tekshirmoqchi bo'lsangiz kabinetni ulash shart emas, Vizani tekshirish tugmasini bosing!.` |
| `connect_first_slash` | `⚠️ Consulting Kabineti ulanmagan. Avval /cabinet orqali login va parollarni terib ulaning.` |

### Account info
| Key | Current `uz` value |
|---|---|
| `account_not_connected` | `⚙ *Profilni boshqarish*\n\nHolat: 🛑 *Ulanmagan*\n\nVisaCheck kabinetini ulash uchun tugmani bosing:` |
| `account_info` | `⚙ *Consulting ma'lumotlari*\n\n👤 *Consulting:* {username}\n📧 *Email:* \`{email}\`\n📅 *Ulangan sana:* {date}\n🎓 *Talabalar soni:* {count}\n🔄 *Holat:* Muvaffaqiyatli ulangan\n\nKabinetni o'chirish uchun quyidagi tugmani bosing:` |

### Cabinet categories
| Key | Current `uz` value |
|---|---|
| `cabinet_categories` | `📂 *Kategoriyalar*\n\nKerakli bo'limni tanlang:` |
| `cat_pending` | `Pending` |
| `cat_approved` | `Approved` |
| `cat_cancelled` | `Cancelled` |
| `cat_application` | `Chopsu` |
| `cabinet_header` | `📂 *Kabinet - {cat}* ({n} ta talaba)` |
| `cabinet_empty` | `📭 Bo'limda talabalar topilmadi.` |

### Visa check flow
| Key | Current `uz` value |
|---|---|
| `check_type_prompt` | `✈️ *Visa turini tanlang*:` |
| `check_passport_prompt` | `🔍 *Tezkor tekshirish*\n\nPasport raqamini kiriting (misol: FA1234567):` |
| `check_passport_invalid` | `⚠️ Pasport raqami xato. Misol: FA1234567. Qaytadan kiriting:` |
| `check_name_prompt` | `👤Xalqaro passportdagi Talabaning *Ism-familiyasi, otasining* ismini to'liq kiriting (inglizcha, pasportdagidek):` |
| `check_name_short` | `⚠️ Ism juda qisqa. To'liq kiriting:` |
| `check_dob_prompt` | `📅 Talabaning *Tug'ilgan kuni* (format: YYYY-MM-DD, misol: 2005-03-18):` |
| `check_dob_invalid` | `⚠️ Sana xato. Format: YYYY-MM-DD (misol: 2005-03-18):` |
| `check_appno_prompt` | `📄 E-Visa ariza raqamini kiriting (misol: 5555550001):` |
| `check_appno_invalid` | `⚠️ Ariza raqami xato. Qaytadan kiriting:` |
| `check_waiting` | `⌛ *Kutib turing...*` |
| `check_error` | `❌ *Tekshirish xatosi:* {error}` |

### Autofill
| Key | Current `uz` value |
|---|---|
| `autofill_found` | `🔍 *Bazadan bu passportga tegishli Ma'lumot topildi*\n\nPasport *{passport}*. Quyidagi ma'lumot to'g'rimi?` |
| `autofill_manual_btn` | `👤 Qo'lda kiritish` |
| `autofill_confirm` | `🔍 *Ma'lumotlarni tekshiring*\n\n👤 *Ism:* {name}\n📅 *Tug'ilgan sana:* {dob}\n✈️ *Visa turi:* {visaType}\n\n*Ma'lumotlar to'g'rimi?*` |
| `btn_yes` | `✅ Ha` |
| `btn_no` | `❌ Yo'q` |

### Results
| Key | Current `uz` value |
|---|---|
| `no_result` | `🚫 Natija yo'q\n\nPasport, Ism va Tug'ilgan kunni tekshiring` |
| `check_error_generic` | `❌ *Tekshirish xatosi:* {error}` |

### Refresh
| Key | Current `uz` value |
|---|---|
| `refreshing` | `🔄 *Tekshirilmoqda...*` |
| `refresh_error` | `❌ Yangilash xatosi: {error}` |
| `no_change` | `{name}\nAfsuski o'zgarish yo'q 🤷🏻` |
| `passport_not_found` | `❌ Pasport topilmadi. Qaytadan /check orqali qidiring.` |
| `btn_refresh` | `🔄 Yangilash` |

### PDF
| Key | Current `uz` value |
|---|---|
| `pdf_loading` | `⏳ *Viza yuklab olinmoqda...*\n_Iltimos kutib turing, visa.go.kr portaliga so'rov yuborilmoqda..._` |
| `pdf_no_student` | `❌ Talaba ma'lumotlari topilmadi. Avval statusni tekshiring.` |
| `pdf_caption` | `📄 *Koreya vizasi* ({passport})` |
| `pdf_error` | `❌ *Vizani yuklab bo'lmadi:* {error}` |
| `btn_pdf` | `📥 Viza (pdf)` |

### Save to cabinet
| Key | Current `uz` value |
|---|---|
| `save_prompt` | `💾 Bu talaba Consulting kabinetga saqlansinmi?` |
| `save_no` | `📝 Kabinetga saqlanmadi.` |
| `save_data_missing` | `⚠️ Ma'lumot topilmadi. Qaytadan tekshiring.` |
| `save_updated` | `✅ *{passport}* Consulting kabinetda yangilandi.` |
| `save_restored` | `✅ *{passport}* COnsulting kabinetga qayta qo'shildi.` |
| `save_saved` | `✅ *{passport}* Consulting kabinetga saqlandi!` |
| `save_error` | `❌ Saqlashda xatolik: {error}` |

### Keyboard labels
| Key | Current `uz` value |
|---|---|
| `visa_type_embassy` | `Elchixona orqali` |
| `visa_type_evisa` | `Elektron (E-Visa)` |
| `tab_pending` | `⏳ Kutilmoqda` |
| `tab_application` | `📄 Arizalar` |
| `tab_cancelled` | `❌ Rad etildi` |
| `tab_approved` | `🟢 Tasdiqlandi` |

### Welcome / help (long-form)
**`welcome.uz`:**
> Viza arizalarini tekshirish botiga xush kelibsiz! 🇰🇷🤖

> Menudan foydalaning.

**`help.uz`:**
> ℹ️ *Bot bo'yicha qo'llanma*
>
> *Buyruqlar:*
> /start - Botni boshlash
> /cabinet - Kabinetni ulash
> /check - Visani tekshirish
> /help - Yordam menyusi
>
> *Menyular:*
> 📂 *Kabinet* - Talabalar ro'yxati
> 🔍 *Tekshirish* - Visani to'g'ridan-to'g'ri tekshirish
> ⚙ *Consulting* - Sozlamalar va chiqish
>
> Savollar uchun administratorga murojaat qiling. Admin: @khan0200

### Notification (visa status change)
| Key | Current `uz` value |
|---|---|
| `notif_title` | `🔍 *Visa statusini tekshirish*` |
| `notif_visa_type` | `✈️ *Visa turi:*` |
| `notif_partner` | `🏢 *Taklif:*` |
| `notif_app_no` | `📄 *Ariza raqami:*` |
| `notif_submitted` | `📅 *Topshirilgan sana:*` |
| `notif_status` | `🔄 *Holati:*` |
| `notif_checked` | `Tekshirildi:` |
| `notif_result` | `*Natija:*` |
| `notif_reason` | `⚠️ *Sababi:*` |
| `notif_prev_reason` | `Bundan oldingi ariza natijasi:\n🚫 Sababi:` |
| `notif_na` | `N/A` *(not really Uzbek, listed for completeness)* |

---

## 2. `api/notify-telegram.js` (production web-app notifier)

Lines 47–61 and 189–214. This is a **separate copy** of the status-description/label logic — it duplicates `i18n.ts` rather than importing it. Uzbek strings here:

- `'Tabriklaymiz 🎉'`
- `'Arizangiz rad etildi.'`
- `'⏳ Arizangiz jarayonda.'`
- `'🔎 Ko\'rib chiqilmoqda.'`
- `'Status yangilandi.'`
- `today = 'Bugun'`, `'Hech qachon'`
- Labels object (line 188–199): `'🔍 *Visa statusini tekshirish*'`, `'✈️ *Visa turi:*'`, `'🏢 *Hamkor:*'`, `'📄 *Ariza raqami:*'`, `'📅 *Topshirilgan sana:*'`, `'🔄 *Holati:*'`, `'Tekshirildi:'`, `'*Natija:*'`, `'⚠️ *Sababi:*'`, `'Bundan oldingi ariza natijasi:\n🚫 Sababi:'`
- Buttons: `'🔄 Yangilash'`, `'📥 Viza (pdf)'`

## 3. `proxy.js` (local dev mirror — Uzbek-only, no English at all)

Lines 588–657. Same content as above but hardcoded with no `lang` switch:
- `'Tabriklaymiz 🎉'`, `'Arizangiz rad etildi.'`, `'⏳ Arizangiz jarayonda.'`, `'🔎 Ko\'rib chiqilmoqda.'`, `'Status yangilandi.'`
- `'Hech qachon'`, `'Bugun'`
- Message template (line 629–646): `'🔍 *Visa statusini tekshirish*'`, `'✈️ *Visa turi:*'`, `'🏢 *Hamkor:*'`, `'📄 *Ariza raqami:*'`, `'📅 *Topshirilgan sana:*'`, `'🔄 *Holati:*'`, `'Tekshirildi:'`, `'*Natija:*'`, `'⚠️ *Sababi:*'`, `'Bundan oldingi ariza natijasi:\n🚫 Sababi:'`
- Buttons: `'🔄 Yangilash'`, `'📥 Viza (pdf)'`

---

## 4. Stray strings NOT in the dictionary (found outside `i18n.ts`)

These are hardcoded directly in code, not looked up via `t()` — worth knowing about even though they're not strictly "polish the wording" (some are logic, not display text you'd naturally edit in the dictionary table above):

- **`bot/keyboards.ts:19`** — fallback profile button label: `'⚙ Consultingni ulash'` (shown only when no cabinet is connected yet).
- **`bot/handlers.ts:39`** — back-button *matching* logic (not a message, just string comparisons): checks incoming text against `'⬅️ Orqaga'`, `'⬅ Orqaga'`, `.includes('orqaga')`, `'<Ortga'`. Note `'<Ortga'` looks like a typo for `'Ortga'`/`'Orqaga'` — worth double-checking if that's intentional or a bug.
- **`bot/handlers.ts:629` and `:880`** — inline link text: `'📄 [Visa sertifikatini yuklash](...)'` (Uzbek hardcoded even in the `lang === 'en'` branch at line 629, though line 880 does correctly switch to `'Download visa certificate'` for English — inconsistent between the two call sites).
- **`lib/cabinet.ts`** — `getStatusDescription`, `formatLastChecked`, `formatStudentCard` (lines 44–137) each have their **own** inline `lang === 'en' ? ... : ...` Uzbek/English pairs, duplicating `i18n.ts`'s `notif_*` keys instead of calling `t()`. Same Uzbek text as the table above (Tabriklaymiz, Bugun, Hech qachon, Eski/Yangi, Tekshirildi, etc.) but a second copy to keep in sync if you edit wording.
- **`lib/auth.ts:53` and `:61`** — `'Account not found. Please register on the website first.'` and `'Invalid password. Please check your credentials.'` are **English-only**, no Uzbek at all, even though `handlers.ts:87` displays them wrapped in the Uzbek `login_error_prefix` (`❌ *Xatolik*`). So a Uzbek-language user sees an English error sentence after an Uzbek "Xatolik" heading — not a wording-polish item, but a real translation gap if you want full UZ coverage.

---

## Suggested approach

Since `lib/i18n.ts` covers ~95% of everything and is the single source of truth for the real bot, polishing that file's `uz` column is almost certainly all you need. The `proxy.js` / `api/notify-telegram.js` copies are near-identical wording already — if you change phrasing in one, let me know and I'll mirror it to the other two so all three stay consistent (they're currently three separate hand-maintained copies of the same handful of phrases).
