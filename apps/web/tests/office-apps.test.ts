import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOfficeApps } from '../src/lib/sovereign-apps/office-apps'

test('includes the Nextcloud tile when the URL is set', () => {
  const apps = buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: 'https://cloud.roebel.app' })
  assert.equal(apps.length, 1)
  assert.equal(apps[0].url, 'https://cloud.roebel.app')
  assert.equal(apps[0].key, 'nextcloud')
})

test('hides apps whose URL is unset or blank (graceful pre-deploy)', () => {
  assert.deepEqual(buildOfficeApps({}), [])
  assert.deepEqual(buildOfficeApps({ NEXT_PUBLIC_NEXTCLOUD_URL: '   ' }), [])
})
