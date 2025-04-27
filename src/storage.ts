import { JSONFilePreset } from 'lowdb/node'

export interface YougileSession {
  key: string
  userId: string
}

export interface YougileTask {
  uuid: string
  numericId: number
  title: string
}

export interface YougileUser {
  uuid: string
  name: string
}

export interface StorageData {
  session?: YougileSession,
  tasksCache: YougileTask[],
  usersCache: YougileUser[]
}

const defaultData: StorageData = { tasksCache: [], usersCache: [] }
export const db = await JSONFilePreset<StorageData>('db.json', defaultData)