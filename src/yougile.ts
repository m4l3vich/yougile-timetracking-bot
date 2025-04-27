import { promises as fs } from 'fs'
import { db, YougileSession, YougileTask, YougileUser } from './storage.js'

const API_URL = process.env.YG_API_URL ?? 'https://an3-acc2.yougile.com'
const CREDENTIALS_FILE = process.env.YG_CREDENTIALS_FILE ?? './credentials.txt'

interface YougileResponse {
  result: string
}

interface YougileLoginResponse extends YougileResponse, YougileSession {}

interface YougileTimetrackingResponse extends YougileResponse {
  isEventsLeft: boolean
  events: {
    [key: string]: {
      type: 'timetracking'
      obj: string
      options: {
        oldValue?: { plan: number, work: number }
        newValue: { plan: number, work: number }
      }
    }
  }
}

interface YougileIndexResponse extends YougileResponse {
  accounts: {
    id: string
    realName: string
  }[]
  data: {
    companyId: string
    index: {
      [key: string]: {
        id: string
        dataType: string
        title: string
        data?: { by: string }
      }
    }
  }[]
}

interface YougileNumericIdsResponse extends YougileResponse {
  numericIds: Record<string, string>
}

async function login () {
  const [email, password] = (await fs.readFile(CREDENTIALS_FILE, 'utf8'))
    .split(':')

  const resp = await fetch(
    API_URL + '/data/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password
      })
    }
  )

  const body: YougileLoginResponse = await resp.json()
  if (body.result !== 'ok') {
    console.error(body)
    throw new Error('login failed')
  }
  
  db.data.session = { key: body.key, userId: body.userId }
  return db.write()
}

async function requestAPI<T extends YougileResponse> (url: string, params: Record<string, unknown>): Promise<T> {
  const resp = await fetch(
    API_URL + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }
  )

  const json = await resp.json() as T
  if (json.result !== 'ok') {
    console.error(json)
    throw new Error('request failed')
  }

  return json
}

export async function updateCache (triedLogin = false) {
  try {
    if (!db.data.session) throw new Error('no session')

    const indexResp = await requestAPI<YougileIndexResponse>('/data/index', {
      key: db.data.session.key,
      userId: db.data.session.userId,
      paging: true,
      count: 100,
      v: 8
    })

    const companyIndex = indexResp.data
      .find(e => e.companyId === process.env.YG_COMPANY_ID)
    if (!companyIndex) throw new Error('no company in index')

    db.data.tasksCache = []
    const tasks = Object.values(companyIndex.index).filter(e => {
      if (e.dataType !== 'Hub') return false
      if (typeof e.data?.by !== 'string') return false
      return true
    })

    const numericIdsResp = await requestAPI<YougileNumericIdsResponse>(
      '/data/id-tasks/get-ids', {
        key: db.data.session.key,
        userId: db.data.session.userId,
        companyId: process.env.YG_COMPANY_ID,
        taskIds: tasks.map(e => e.id),
        v: 8
      }
    )

    for (const task of tasks) {
      if (task.dataType !== 'Hub') continue
      if (typeof task.data?.by !== 'string') continue

      db.data.tasksCache.push({
        uuid: task.id,
        numericId: Number(numericIdsResp.numericIds[task.id]),
        title: task.title
      })
    }

    const users: YougileUser[] = indexResp.accounts.map(e => ({ uuid: e.id, name: e.realName }))
    db.data.usersCache = users

    return db.write()
  } catch (err) {
    if (!triedLogin) {
      await login()
      return updateCache(true)
    }

    console.error('Failed to update tasks cache:', err)
    throw err
  }
}

async function resolveTaskIds (uuids: Set<string>): Promise<Map<string, YougileTask>> {
  const result: Map<string, YougileTask> = new Map()

  for (const task of db.data.tasksCache) {
    if (uuids.has(task.uuid)) result.set(task.uuid, task)
    if (result.size === uuids.size) break
  }

  if (result.size < uuids.size) {
    await updateCache()
    return resolveTaskIds(uuids)
  }

  return result
}

interface TrackerTask extends YougileTask {
  hours: number
}

export async function getTrackerTasks (filters?: Record<string, unknown>, triedLogin = false): Promise<TrackerTask[]> {
  try {
    if (!db.data.session) throw new Error('no session')

    const trackingJson = await requestAPI<YougileTimetrackingResponse>(
      '/data/user-events/list-limited', {
        key: db.data.session.key,
        userId: db.data.session.userId,
        companyId: process.env.YG_COMPANY_ID,
        count: 100,
        v: 8,
        filters: { ...filters, action: ['timetracking'] }
      }
    )
    const taskIds = new Set(Object.values(trackingJson.events).map(e => e.obj))

    const tasksMap = await resolveTaskIds(taskIds)
    const result: Map<string, TrackerTask> = new Map()

    for (const item of Object.values(trackingJson.events)) {
      if (!result.has(item.obj)) {
        result.set(item.obj, { ...tasksMap.get(item.obj)!, hours: 0 })
      }

      if (!item.options.newValue?.work) continue

      const task = result.get(item.obj)!
      const delta = item.options.newValue.work - (item.options.oldValue?.work ?? 0)

      task.hours += delta
    }

    return [...result.values()]
  } catch (err) {
    if (!triedLogin) {
      await login()
      return getTrackerTasks(filters, true)
    }

    console.error('Failed to get tracker data:', err)
    throw err
  }
}