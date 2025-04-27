import { InlineKeyboard } from 'puregram'
import { db } from '../storage.js'
import { BotSceneContext } from '../types/bot.js'
import { updateCache } from '../yougile.js'
import { BotPayload, isBotPayload } from '../bot-payload.js'

export async function selectUser (ctx: BotSceneContext): Promise<void> {
  if (ctx.is('callback_query') && ctx.payload.data?.startsWith(BotPayload.GenerateAgain + ':')) {
    return ctx.scene.step.go(2)
  }

  if (ctx.scene.step.firstTime || !ctx.is('callback_query')) {
    if (!db.data.usersCache.length) {
      await updateCache()
    }

    const keyboard = InlineKeyboard.keyboard(
      db.data.usersCache.map(user =>
        InlineKeyboard.textButton({
          text: user.name,
          payload: BotPayload.SelectUser + ':' + user.uuid
        })
      )
    )

    if (ctx.is('callback_query')) {
      await ctx.editText('[1/3] 👤 Выберите сотрудника:', { reply_markup: keyboard })
      return
    }

    await ctx.send('[1/3] 👤 Выберите сотрудника:', { reply_markup: keyboard })
    return
  }

  const [key, uuid] = (ctx.payload.data ?? '').split(':')
  if (!isBotPayload(key) || key !== BotPayload.SelectUser) return void ctx.answerCallbackQuery()

  const userExists = db.data.usersCache.some(e => e.uuid === uuid)

  if (!userExists) return
  ctx.scene.state.userId = uuid

  return ctx.scene.step.next()
}