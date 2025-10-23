import dayjs from 'dayjs'
import { InlineKeyboardBuilder } from 'puregram'
import { BotSceneContext } from '../types/bot.js'
import { BotPayload } from '../bot-payload.js'

export async function selectDateSpan(ctx: BotSceneContext): Promise<void> {
  if (!ctx.is('callback_query')) return ctx.scene.leave()

  const currentMonth = dayjs().format('YYYY-MM')
  if (
    ctx.scene.step.firstTime ||
    ctx.payload.data === BotPayload.CloseCalendar
  ) {
    ctx.scene.state.dateStart = ''
    ctx.scene.state.dateEnd = ''
    const keyboard = new InlineKeyboardBuilder()
      .textButton({
        text: 'Текущий месяц',
        payload: BotPayload.DatespanCurrentMonth
      })
      .row()
      .textButton({
        text: 'Прошлый месяц',
        payload: BotPayload.DatespanPrevMonth
      })
      .row()
      .textButton({
        text: 'Выбрать в календаре',
        payload: BotPayload.ShowCalendar + ':' + currentMonth
      })
      .row()
      .textButton({ text: '⬅️ Назад', payload: BotPayload.GoBack })

    await ctx.editText('[2/3] 📅 Выберите даты:', { reply_markup: keyboard })
    return
  }

  const [key, arg] = (ctx.payload.data ?? '').split(':')

  switch (key) {
    case BotPayload.GoBack:
      ctx.scene.state.dateStart = ''
      ctx.scene.state.dateEnd = ''
      return ctx.scene.step.previous()

    case BotPayload.DatespanCurrentMonth:
      ctx.scene.state.dateStart = dayjs().startOf('month').format('YYYY-MM-DD')
      ctx.scene.state.dateEnd = dayjs().endOf('month').format('YYYY-MM-DD')
      return ctx.scene.step.next()

    case BotPayload.DatespanPrevMonth: {
      const base = dayjs().add(-1, 'month')
      ctx.scene.state.dateStart = base.startOf('month').format('YYYY-MM-DD')
      ctx.scene.state.dateEnd = base.endOf('month').format('YYYY-MM-DD')
      return ctx.scene.step.next()
    }

    case BotPayload.RemoveDateStart:
      ctx.scene.state.dateStart = ''
    // eslint-disable-next-line no-fallthrough
    case BotPayload.ShowCalendar: {
      const date = dayjs(arg, 'YYYY-MM')
      const calKeyboard = inlineCalendar(date.year(), date.month())
      calKeyboard.row()

      calKeyboard.textButton({
        text: 'Назад',
        payload: BotPayload.CloseCalendar
      })

      let text = '[2/3] 📅 Выберите даты:'

      if (ctx.scene.state.dateStart) {
        const dateStartHuman = dayjs(ctx.scene.state.dateStart).format(
          'DD MMM YYYY'
        )
        text += `\nВыбрана дата начала: ${dateStartHuman}`
        calKeyboard.textButton({
          text: 'Изм. дату начала',
          payload: BotPayload.RemoveDateStart + ':' + currentMonth
        })
      }

      await ctx.editText(text, { reply_markup: calKeyboard })
      return
    }

    case BotPayload.SelectCalendarDate: {
      if (ctx.scene.state.dateStart) {
        ctx.scene.state.dateEnd = arg
        return ctx.scene.step.next()
      } else {
        ctx.scene.state.dateStart = arg
        const date = dayjs(arg)
        const dateHuman = date.format('DD MMM YYYY')
        const calKeyboard = inlineCalendar(date.year(), date.month())
        calKeyboard.row()

        calKeyboard.textButton({
          text: 'Назад',
          payload: BotPayload.CloseCalendar
        })
        calKeyboard.textButton({
          text: 'Изм. дату начала',
          payload: BotPayload.RemoveDateStart + ':' + currentMonth
        })

        await ctx.editText(
          `[2/3] 📅 Выберите даты:\nВыбрана дата начала: ${dateHuman}`,
          { reply_markup: calKeyboard }
        )
        return
      }
    }

    default:
      await ctx.answerCallbackQuery()
      return
  }
}

function inlineCalendar(year: number, month: number): InlineKeyboardBuilder {
  const currentMonth = dayjs()
    .set('year', year)
    .set('month', month)
    .startOf('month')
  const currentMonthHuman = currentMonth.format('MMM YYYY')

  const prevMonthStr = currentMonth.add(-1, 'month').format('YYYY-MM')
  const nextMonthStr = currentMonth.add(1, 'month').format('YYYY-MM')

  const keyboard = new InlineKeyboardBuilder()
    .textButton({ text: '⬅️', payload: `cal:${prevMonthStr}` })
    .textButton({ text: currentMonthHuman, payload: 'noop' })
    .textButton({ text: '➡️', payload: `cal:${nextMonthStr}` })
    .row()

  const dateStart = currentMonth.startOf('week')
  const dateEnd = currentMonth.endOf('month').endOf('week')

  for (let d = dateStart; d.isBefore(dateEnd); d = d.add(1, 'day')) {
    const prevDay = d.add(-1, 'day')
    if (!prevDay.isSame(d, 'week')) keyboard.row()

    if (d.isSame(currentMonth, 'month')) {
      keyboard.textButton({
        text: d.format('D'),
        payload: `scal:${d.format('YYYY-MM-DD')}`
      })
    } else {
      keyboard.textButton({ text: ' ', payload: 'noop' })
    }
  }

  return keyboard
}
