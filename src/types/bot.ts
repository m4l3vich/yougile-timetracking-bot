import { StepContext } from '@puregram/scenes'
import { CallbackQueryContext, MessageContext } from 'puregram'

export type MainSceneState = Record<'userId' | 'dateStart' | 'dateEnd', string>
export type BotSceneContext = (MessageContext | CallbackQueryContext) &
  StepContext<MainSceneState>
