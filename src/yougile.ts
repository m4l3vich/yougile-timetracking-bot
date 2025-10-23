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
        oldValue?: { plan: number; work: number }
        newValue: { plan: number; work: number }
      }
    }
  }
}

interface YougileIndexV2Response extends YougileResponse {
  companies: {
    users: {
      [key: string]: { isAdmin: boolean }
    }

    accounts: {
      id: string
      realName: string
    }[]

    id: string
    revision: number
    data: {
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

async function login(): Promise<void> {
  try {
    const credentials = await fs.readFile(CREDENTIALS_FILE, 'utf8')
    const [email, password] = credentials.trim().split(':')

    if (!email || !password) {
      throw new Error('invalid credentials format')
    }

    const response = await requestAPI<YougileLoginResponse>('/data/key', {
      email,
      password
    })

    db.data.session = {
      key: response.key,
      userId: response.userId
    }

    await db.write()
  } catch (err) {
    console.error('Login failed:', err)
    throw err
  }
}

async function requestAPI<T extends YougileResponse>(
  url: string,
  params: Record<string, unknown>
): Promise<T> {
  const resp = await fetch(API_URL + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })

  const json = (await resp.json()) as T
  if (json.result !== 'ok') {
    console.error(json)
    throw new Error('request failed')
  }

  return json
}

export async function updateCache(triedLogin = false) {
  try {
    if (!db.data.session) throw new Error('no session')

    const indexResp = await requestAPI<YougileIndexV2Response>(
      '/data/index-v2',
      {
        key: db.data.session.key,
        userId: db.data.session.userId,
        minorVersion: 8,
        acceptAll: false,
        companies: [
          {
            id: process.env.YG_COMPANY_ID,
            revision: db.data.revision
          }
        ],
        v: 8
      }
    )

    const company = indexResp.companies.find(
      e => e.id === process.env.YG_COMPANY_ID
    )
    if (!company) throw new Error('no company in index')

    db.data.tasksCache = []
    const tasks = Object.values(company.data).filter(e => {
      if (e.dataType !== 'Hub') return false
      if (typeof e.data?.by !== 'string') return false
      return true
    })

    const numericIdsResp = await requestAPI<YougileNumericIdsResponse>(
      '/data/id-tasks/get-ids',
      {
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

    const users: YougileUser[] = company.accounts.map(e => ({
      uuid: e.id,
      name: e.realName
    }))
    db.data.usersCache = users

    db.data.revision = company.revision
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

async function resolveTaskIds(
  uuids: Set<string>
): Promise<Map<string, YougileTask>> {
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

export async function getTrackerTasks(
  filters?: Record<string, unknown>,
  triedLogin = false
): Promise<TrackerTask[]> {
  try {
    if (!db.data.session) throw new Error('no session')

    const trackingJson = await requestAPI<YougileTimetrackingResponse>(
      '/data/user-events/list-limited',
      {
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
      const delta =
        item.options.newValue.work - (item.options.oldValue?.work ?? 0)

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
