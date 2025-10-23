import ExcelJS from 'exceljs'
import { getTrackerTasks } from './yougile.js'
import { db } from './storage.js'

export type reportArgs = { user: string; start: number; end: number }

export async function generateCountReport({
  user,
  start,
  end
}: reportArgs): Promise<string> {
  const tasks = await getTrackerTasks({
    createdBy: [{ user }],
    createdAt: { start, end }
  })

  const totalTime = tasks.reduce((acc, e) => acc + e.hours, 0)
  const taskCount = tasks.length

  return `Кол-во часов: ${totalTime}, кол-во задач: ${taskCount}`
}

export async function generateXlsxReport({
  user,
  start,
  end
}: reportArgs): Promise<ExcelJS.Workbook> {
  const userName = db.data.usersCache.find(e => e.uuid === user)?.name
  const tasks = await getTrackerTasks({
    createdBy: [{ user }],
    createdAt: { start, end }
  })

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile('./template.xlsx')

  const sheet = workbook.worksheets[0]
  sheet.getCell('B1').value = userName
  sheet.getCell('C2').value = tasks.reduce((acc, e) => acc + e.hours, 0)

  const rows = tasks.map(e => [
    e.numericId,
    e.title,
    e.hours.toLocaleString('ru-RU') + 'ч'
  ])
  const newRow = sheet.addRow(rows[0])
  newRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' }
  newRow.getCell(2).alignment = {
    vertical: 'middle',
    horizontal: 'left',
    wrapText: true
  }
  newRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }

  sheet.addRows(rows.slice(1), 'i')

  return workbook
}
