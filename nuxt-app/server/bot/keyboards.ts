import { Keyboard, InlineKeyboard } from 'grammy'
import { t, type Lang } from './i18n'

/**
 * Main menu reply keyboard
 */
export function mainMenuKeyboard(lang: Lang, consultingName?: string): Keyboard {
  const keyboard = new Keyboard()
    .text(t(lang, 'visa_check')).row()
    .text(t(lang, 'settings')).row()
  
  if (consultingName) {
    keyboard.text(`${consultingName} ${t(lang, 'cabinet_suffix')}`)
  } else {
    keyboard.text(t(lang, 'connect_consulting'))
  }
  
  return keyboard.resized().oneTime(false)
}

/**
 * Visa type inline keyboard
 */
export function visaTypeKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'embassy'), 'visa_type:Embassy').row()
    .text(t(lang, 'evisa'), 'visa_type:E-Visa').row()
    .text(t(lang, 'regional'), 'visa_type:Regional')
}

/**
 * Settings inline keyboard
 */
export function settingsKeyboard(lang: Lang, isConnected: boolean, consultingName?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(t(lang, 'language'), 'settings:language').row()
  
  if (isConnected && consultingName) {
    keyboard.text(t(lang, 'connected_to', { name: consultingName }), 'noop')
    keyboard.text(t(lang, 'disconnect'), 'settings:disconnect').row()
  } else {
    keyboard.text(t(lang, 'connect_consulting'), 'settings:connect').row()
  }
  
  keyboard.text(t(lang, 'back'), 'settings:back')
  
  return keyboard
}

/**
 * Language selection inline keyboard
 */
export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🇺🇿 O'zbekcha", 'lang:uz')
    .text("🇬🇧 English", 'lang:en')
}

/**
 * Cabinet tabs inline keyboard
 */
export function cabinetTabsKeyboard(lang: Lang, counts: { pending: number; application: number; cancelled: number; approved: number }): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'pending_tab', { count: String(counts.pending) }), 'cab:pending:0')
    .text(t(lang, 'application_tab', { count: String(counts.application) }), 'cab:application:0').row()
    .text(t(lang, 'cancelled_tab', { count: String(counts.cancelled) }), 'cab:cancelled:0')
    .text(t(lang, 'approved_tab', { count: String(counts.approved) }), 'cab:approved:0').row()
    .text(t(lang, 'refresh'), 'cab:refresh')
}

export interface CabinetStudentItem {
  passport: string
  fullName?: string
  index: number
  hasPdf?: boolean
}

/**
 * Pagination inline keyboard with individual student refresh buttons
 */
export function paginationKeyboard(
  lang: Lang,
  tab: string,
  page: number,
  totalPages: number,
  students: CabinetStudentItem[] = []
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  
  // Per-student refresh buttons (2 per row)
  for (let i = 0; i < students.length; i += 2) {
    const s1 = students[i]
    const s2 = students[i + 1]

    if (s1) {
      const shortName = s1.fullName ? s1.fullName.split(' ')[0] : s1.passport
      keyboard.text(`🔄 ${s1.index}. ${shortName}`, `cab_chk:${s1.passport}:${tab}:${page}`)
    }
    if (s2) {
      const shortName = s2.fullName ? s2.fullName.split(' ')[0] : s2.passport
      keyboard.text(`🔄 ${s2.index}. ${shortName}`, `cab_chk:${s2.passport}:${tab}:${page}`)
    }
    keyboard.row()
  }

  // If any student on this page has PDF available, add download buttons
  const approvedWithPdf = students.filter(s => s.hasPdf)
  if (approvedWithPdf.length > 0) {
    for (let i = 0; i < approvedWithPdf.length; i += 2) {
      const s1 = approvedWithPdf[i]
      const s2 = approvedWithPdf[i + 1]
      if (s1) {
        keyboard.text(`📥 ${s1.index}. PDF`, `visa_download:${s1.passport}`)
      }
      if (s2) {
        keyboard.text(`📥 ${s2.index}. PDF`, `visa_download:${s2.passport}`)
      }
      keyboard.row()
    }
  }
  
  // Navigation row: [◀ Previous] [Page 1/3] [Next ▶]
  if (page > 0) {
    keyboard.text(t(lang, 'previous'), `cab:${tab}:${page - 1}`)
  }
  
  keyboard.text(t(lang, 'page_info', { page: String(page + 1), total: String(totalPages) }), 'noop')
  
  if (page < totalPages - 1) {
    keyboard.text(t(lang, 'next'), `cab:${tab}:${page + 1}`)
  }
  
  keyboard.row()

  // Actions row: [🔄 Refresh List] [⬅ Back]
  const refreshLabel = lang === 'uz' ? '🔄 Hammasini yangilash' : '🔄 Refresh List'
  keyboard.text(refreshLabel, `cab:${tab}:${page}:refresh`)
  keyboard.text(t(lang, 'back'), 'cab:back')
  
  return keyboard
}

/**
 * Refresh result inline keyboard
 */
export function refreshResultKeyboard(lang: Lang, passport: string, isApproved: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(t(lang, 'refresh'), `visa_refresh:${passport}`)
  
  if (isApproved) {
    keyboard.row().text(t(lang, 'download_visa'), `visa_download:${passport}`)
  }
  
  keyboard.row().text(t(lang, 'main_menu'), 'visa:back')
  
  return keyboard
}

/**
 * Disconnect confirmation inline keyboard
 */
export function disconnectConfirmKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'yes'), 'disconnect:yes')
    .text(t(lang, 'no'), 'disconnect:no')
}

/**
 * Passport details confirmation inline keyboard
 */
export function passportConfirmKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'confirm_and_check'), 'visa_confirm:check').row()
    .text(t(lang, 'edit_manually'), 'visa_edit:manual')
}

/**
 * Back to menu inline keyboard
 */
export function backToMenuKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'back'), 'menu:back')
}
