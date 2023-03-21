#!/usr/bin/env zx

import "zx/globals"
import * as semver from "semver"

function fail(msg) {
    console.error(`Error: ${msg}`)
    process.exit(1)
}

await $`git pull`

const mainPkgJson = await fs.readJSON("devicescript/package.json")
const v0 = semver.parse(mainPkgJson.version)

const currVer = (
    await $`git describe --dirty --tags --match 'v[0-9]*' --always`
).stdout.trim()
const v1 = semver.parse(currVer)

let nextVer = `${v0.major}.${v0.minor}.${v0.patch * 100}`

if (v1 && semver.cmp(nextVer, "<=", v1)) {
    if (v1.major != v0.major || v1.minor != v0.minor)
        fail(`current version ${currVer} is too new`)
    nextVer = `${v1.major}.${v1.minor}.${v1.patch + 1}`
}

echo(`bumping ${currVer} -> ${nextVer}`)

if (!argv.force && (await $`git status --porcelain --untracked-files=no`).stdout.trim())
    fail("you have modified files")

await question(`Enter to continue: `)
await $`git tag ${"v" + nextVer}`
await $`git push --tags`
await $`git push`
