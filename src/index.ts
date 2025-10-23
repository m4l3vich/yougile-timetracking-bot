import 'dotenv/config'
import './config.js'

import { Telegram } from 'puregram'
import { session } from '@puregram/session'
import { SceneManager, StepContext, StepScene } from '@puregram/scenes'

import { BotSceneContext, MainSceneState } from './types/bot.js'
import * as sceneSteps from './steps/index.js'

import dayjs from 'dayjs'
import 'dayjs/locale/ru.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { BotPayload } from './bot-payload.js'
dayjs.locale('ru')
dayjs.extend(customParseFormat)

const telegram = Telegram.fromToken(process.env.TG_TOKEN)
const sceneManager = new SceneManager()

if (process.env.TG_WHITELIST) {
  const whitelist = process.env.TG_WHITELIST.split(',')
  telegram.updates.use((ctx, next) => {
    if (!ctx.is(['message', 'callback_query'])) return

    const userId =
      ctx.update?.callback_query?.from.id.toString() ??
      ctx.update?.message?.from?.id.toString() ??
      ''

    if (whitelist.includes(userId)) return next()
  })
}

telegram.updates.on(['message', 'callback_query'], session())
telegram.updates.on(['message', 'callback_query'], sceneManager.middleware)
telegram.updates.on(
  ['message', 'callback_query'],
  sceneManager.middlewareIntercept
)

telegram.updates.on<'message', StepContext>('message', ctx => {
  if (ctx.text?.startsWith('/start')) return ctx.scene.enter('main')
})

telegram.updates.on<'callback_query', StepContext>(
  'callback_query',
  (ctx, next) => {
    if (!ctx.payload.data?.startsWith(BotPayload.GenerateAgain + ':'))
      return next()

    // report format will be parsed in the step handler
    const [userId, dateStart, dateEnd] = ctx.payload.data.split(':').slice(1)

    // restore dashes in UUID
    const userIdWithDashes = userId.replace(
      /(.{8})(.{4})(.{4})(.{4})(.{12})/,
      '$1-$2-$3-$4-$5'
    )

    const state: MainSceneState = {
      userId: userIdWithDashes,
      dateStart: dayjs(dateStart, 'YYYYMMDD').format('YYYY-MM-DD'),
      dateEnd: dayjs(dateEnd, 'YYYYMMDD').format('YYYY-MM-DD')
    }

    ctx.scene.enter('main', { state })
  }
)

sceneManager.addScenes([
  new StepScene<BotSceneContext>('main', [
    sceneSteps.selectUser,
    sceneSteps.selectDateSpan,
    sceneSteps.selectReportFormat
  ])
])

telegram.updates.startPolling().then(() => {
  console.log('Bot running')
})
