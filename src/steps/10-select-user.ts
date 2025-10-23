import { InlineKeyboard } from 'puregram'
import { db } from '../storage.js'
import { BotSceneContext } from '../types/bot.js'
import { updateCache } from '../yougile.js'
import { BotPayload, isBotPayload } from '../bot-payload.js'
import { TelegramInlineKeyboardButton } from 'puregram/generated'

const MAX_USERS_ON_PAGE = 12

function generateUserSelectKeyboard(page: number = 0) {
  const maxPage = Math.floor(db.data.usersCache.length / MAX_USERS_ON_PAGE)
  let paginationButtons: TelegramInlineKeyboardButton[] = []
  let users = db.data.usersCache

  if (db.data.usersCache.length > MAX_USERS_ON_PAGE) {
    users = db.data.usersCache.slice(
      page * MAX_USERS_ON_PAGE,
      (page + 1) * MAX_USERS_ON_PAGE
    )

    paginationButtons = [
      InlineKeyboard.textButton({
        text: '⬅️',
        payload:
          page > 0 //
            ? BotPayload.SelectUserPagination + ':' + (page - 1)
            : 'noop'
      }),

      InlineKeyboard.textButton({
        text: `${page + 1} / ${maxPage + 1}`,
        payload: 'noop'
      }),

      InlineKeyboard.textButton({
        text: '➡️',
        payload:
          maxPage > page
            ? BotPayload.SelectUserPagination + ':' + (page + 1)
            : 'noop'
      })
    ]
  }

  return InlineKeyboard.keyboard([
    ...users.map(user =>
      InlineKeyboard.textButton({
        text: user.name,
        payload: BotPayload.SelectUser + ':' + user.uuid
      })
    ),
    paginationButtons
  ])
}

export async function selectUser(ctx: BotSceneContext): Promise<void> {
  if (
    ctx.is('callback_query') &&
    ctx.payload.data?.startsWith(BotPayload.GenerateAgain + ':')
  ) {
    return ctx.scene.step.go(2)
  }

  if (ctx.scene.step.firstTime || !ctx.is('callback_query')) {
    if (!db.data.usersCache.length) {
      await updateCache()
    }

    const keyboard = generateUserSelectKeyboard()

    if (ctx.is('callback_query')) {
      await ctx.editText('[1/3] 👤 Выберите сотрудника:', {
        reply_markup: keyboard
      })
      return
    }

    await ctx.send('[1/3] 👤 Выберите сотрудника:', { reply_markup: keyboard })
    return
  }

  const [key, arg] = (ctx.payload.data ?? '').split(':')
  if (!isBotPayload(key)) return void ctx.answerCallbackQuery()

  if (key === BotPayload.SelectUserPagination && !Number.isNaN(arg)) {
    await ctx.editText('[1/3] 👤 Выберите сотрудника:', {
      reply_markup: generateUserSelectKeyboard(Number(arg))
    })
    return
  }

  if (key === BotPayload.SelectUser) {
    const userExists = db.data.usersCache.some(e => e.uuid === arg)

    if (!userExists) return
    ctx.scene.state.userId = arg

    return ctx.scene.step.next()
  }

  return void ctx.answerCallbackQuery()
}
