export enum BotPayload {
  SelectUser = 'user',
  SelectUserPagination = 'userp',
  CloseCalendar = 'dspan',
  DatespanCurrentMonth = 'dspan-cmonth',
  DatespanPrevMonth = 'dspan-pmonth',
  Noop = 'noop',
  GoBack = 'back',
  ShowCalendar = 'cal',
  SelectCalendarDate = 'scal',
  SelectFormat = 'fmt',
  RemoveDateStart = 'rdate1',
  GenerateAgain = 'gen'
}

export function isBotPayload(value: string): value is BotPayload {
  return Object.values(BotPayload).includes(value as BotPayload)
}
