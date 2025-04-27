import dayjs from 'dayjs'
import { InlineKeyboardBuilder, InputMedia, MediaSource } from 'puregram'
import { db } from '../storage.js'
import { BotSceneContext } from '../types/bot.js'
import * as reports from '../reports.js'
import { PassThrough } from 'stream'
import { BotPayload, isBotPayload } from '../bot-payload.js'
import { TelegramMessage } from 'puregram/generated'

export async function selectReportFormat (ctx: BotSceneContext): Promise<void> {
  if (!ctx.is('callback_query')) return ctx.scene.leave()
  const isGeneratingAgain = ctx.payload.data?.startsWith(BotPayload.GenerateAgain + ':')
  let format: string

  if (isGeneratingAgain)  {
    format = ctx.payload.data?.split(':').pop() ?? ''
    if (!format) return void ctx.answerCallbackQuery()
  } else if (ctx.scene.step.firstTime) {
    const keyboard = new InlineKeyboardBuilder()
      .textButton({ text: '⏳ Количество часов и задач', payload: BotPayload.SelectFormat + ':' + 'count' }).row()
      .textButton({ text: '📄 Таблица Excel (.xlsx)', payload: BotPayload.SelectFormat + ':' + 'xlsx' }).row()
      .textButton({ text: '⬅️ Назад', payload: BotPayload.GoBack }).row()

    await ctx.editText('[3/3] 🗂 Выберите формат отчёта:', { reply_markup: keyboard })
    return
  } else {
    const payload = ctx.payload.data
    const formats = ['count', 'xlsx']
  
    const [key, fmt] = (ctx.payload.data ?? '').split(':')
  
    if (payload === BotPayload.GoBack) return ctx.scene.step.previous()
    if (!isBotPayload(key) || key !== BotPayload.SelectFormat || !formats.includes(fmt)) {
      return void ctx.answerCallbackQuery()
    }

    format = fmt
  }

  
  const userName = db.data.usersCache.find(e => e.uuid === ctx.scene.state.userId)?.name
  const fmtHuman = { count: 'Кол-во часов и задач', xlsx: 'Таблица .xlsx' }[format]

  const dateStartHuman = dayjs(ctx.scene.state.dateStart).format('DD MMM YYYY')
  const dateEndHuman = dayjs(ctx.scene.state.dateEnd).format('DD MMM YYYY')

  const dateStartShort = dayjs(ctx.scene.state.dateStart).format('DD.MM.YY')
  const dateEndShort = dayjs(ctx.scene.state.dateEnd).format('DD.MM.YY')

  const reportParams = [
    `- 👤 Сотрудник: ${userName}`,
    `- 📅 Даты: с ${dateStartHuman} по ${dateEndHuman} (включительно)`,
    `- 🗂 Формат: ${fmtHuman}`
  ]

  const loaderText = ['Генерирую отчёт:', ...reportParams].join('\n')
  const sendLoader = isGeneratingAgain
    // this bot won't be used in groups, so we can use ctx.from.id
    ? ctx.telegram.api.sendMessage({ chat_id: ctx.from.id, text: loaderText })
    : ctx.editText(loaderText)

  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss')
  console.log(`[${timestamp}] User ${ctx.from.id}/@${ctx.from.username} requested report: date ${dateStartShort} to ${dateEndShort}, user ${userName}, fmt ${format}`)

  const refreshParams = [
    BotPayload.GenerateAgain,
    ctx.scene.state.userId,
    ctx.scene.state.dateStart,
    ctx.scene.state.dateEnd,
    format
  ].join(':').replace(/-/g, '') // I hate Telegram's payload limit

  const refreshKeyboard = new InlineKeyboardBuilder()
    .textButton({ text: '🔄 Повторить', payload: refreshParams })

  switch (format) {
    case 'count': {
      const [reportStr, loaderCtx] = await Promise.all([
        reports.generateCountReport({
          user: ctx.scene.state.userId,
          start: dayjs(ctx.scene.state.dateStart).startOf('day').valueOf(),
          end: dayjs(ctx.scene.state.dateEnd).endOf('day').valueOf()
        }),
        sendLoader
      ])

      const reportText = [
        '📊 Отчёт о таймтрекинге',
        ...reportParams.slice(0, -1),
        `- ⏳ ${reportStr}`
      ].join('\n')

      if (isGeneratingAgain)  {
        const msgId = (loaderCtx as TelegramMessage).message_id
        ctx.telegram.api.editMessageText({
          chat_id: ctx.from.id,
          message_id: msgId,
          text: reportText,
          reply_markup: refreshKeyboard
        })
      } else {
        ctx.editText(reportText, { reply_markup: refreshKeyboard })
      }

      break
    }

    case 'xlsx': {
      const [workbook, loaderCtx] = await Promise.all([
        reports.generateXlsxReport({
          user: ctx.scene.state.userId,
          start: dayjs(ctx.scene.state.dateStart).startOf('day').valueOf(),
          end: dayjs(ctx.scene.state.dateEnd).endOf('day').valueOf()
        }),
        sendLoader
      ])

      const stream = new PassThrough()
      workbook.xlsx.write(stream)

      const userSlug = userName?.replace(/\s/g, '_')
      const filename = `report-${userSlug}-${dateStartShort}-${dateEndShort}.xlsx`

      const reportMedia = InputMedia.document(
        MediaSource.stream(stream, { filename }),
        { caption: ['📊 Отчёт о таймтрекинге', ...reportParams.slice(0, -1)].join('\n') }
      )

      if (isGeneratingAgain)  {
        const msgId = (loaderCtx as TelegramMessage).message_id
        ctx.telegram.api.editMessageMedia({
          chat_id: ctx.from.id,
          message_id: msgId,
          media: reportMedia,
          reply_markup: refreshKeyboard
        })
      } else {
        ctx.editMedia(reportMedia, { reply_markup: refreshKeyboard })
      }

      break
    }
  }

  return ctx.scene.leave()
}