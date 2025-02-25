import * as axios from 'axios'
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { exec, spawn } from 'child_process'
import {
  existsSync,
  readFileSync,
  readdirSync
} from 'graceful-fs'

import { execAsync, isOnline } from './utils'
import {
  heroicToolsPath,
  home
} from './constants'
import { logError, logInfo, logWarning } from './logger'


export const DXVK = {
  getLatest: async () => {
    if (!(await isOnline())) {
      logWarning('App offline, skipping possible DXVK update.')
      return
    }

    const tools = [
      { name: 'vkd3d',
        url: 'https://api.github.com/repos/HansKristian-Work/vkd3d-proton/releases/latest',
        extractCommand: 'tar -I zstd -xvf'
      },
      { name: 'dxvk',
        url: 'https://api.github.com/repos/doitsujin/dxvk/releases/latest',
        extractCommand: 'tar -zxf'
      }
    ]

    tools.forEach(async (tool) => {
      const {
        data: { assets }
      } = await axios.default.get(tool.url)

      const {name, browser_download_url: downloadUrl} = assets[0]
      const pkg = name.replace('.tar.gz', '').replace('.tar.zst', '')

      const latestVersion = `${heroicToolsPath}/${tool.name}/${name}`
      const pastVersionCheck = `${heroicToolsPath}/${tool.name}/latest_${tool.name}`
      let pastVersion = ''
      if (existsSync(pastVersionCheck)) {
        pastVersion = readFileSync(pastVersionCheck).toString().split('\n')[0]
      }

      if (pastVersion === pkg) {
        return
      }
      const downloadCommand = `curl -L ${downloadUrl} -o ${latestVersion} --create-dirs`
      const extractCommand = `${tool.extractCommand} ${latestVersion} -C ${heroicToolsPath}/${tool.name}`
      const echoCommand = `echo ${pkg} > ${heroicToolsPath}/${tool.name}/latest_${tool.name}`
      const cleanCommand = `rm ${latestVersion}`

      logInfo(`Updating ${tool.name} to:`, pkg)

      return execAsync(downloadCommand)
        .then(async () => {
          logInfo(`downloaded ${tool.name}`)
          logInfo(`extracting ${tool.name}`)
          exec(echoCommand)
          await execAsync(extractCommand)
          logInfo(`extracting ${tool.name} updated!`)
          exec(cleanCommand)
        })
        .catch((error) => logError(`Error when downloading ${tool.name}`, error))
    })


  },

  installRemove: async (prefix: string, tool: 'dxvk' | 'vkd3d', action: 'backup' | 'restore') => {
    if (!prefix) {
      return
    }
    const winePrefix = prefix.replace('~', home)

    if (!existsSync(`${heroicToolsPath}/${tool}/latest_${tool}`)) {
      logError('dxvk not found!')
      await DXVK.getLatest()
    }

    const globalVersion = readFileSync(`${heroicToolsPath}/${tool}/latest_${tool}`)
      .toString()
      .split('\n')[0]
    const toolPath = `${heroicToolsPath}/${tool}/${globalVersion}`
    const currentVersionCheck = `${winePrefix}/current_${tool}`
    let currentVersion = ''

    if (existsSync(currentVersionCheck)) {
      currentVersion = readFileSync(currentVersionCheck)
        .toString()
        .split('\n')[0]
    }

    const x32Path = `${winePrefix}/drive_c/windows/system32/`
    const x64Path = `${winePrefix}/drive_c/windows/syswow64/`
    const x86Fix = tool === 'vkd3d' ? 'x86' : 'x32'

    const installCommand = `ln -sf ${toolPath}/${x86Fix}/* ${x32Path} && ln -sf ${toolPath}/x64/* ${x64Path}`
    const updatedVersionfile = `echo '${globalVersion}' > ${currentVersionCheck}`

    const filesToBkpx32= readdirSync(`${toolPath}/${x86Fix}`)
    const filesToBkpx64= readdirSync(`${toolPath}/x64/`)

    logInfo(`${action === 'backup' ? 'Backuping' : 'Restoring'} original DLLs`)
    backupRestoreDLLs(filesToBkpx32, x32Path, action)
    backupRestoreDLLs(filesToBkpx64, x64Path, action)

    if(action === 'restore'){
      logInfo(`Removing ${tool} version information`)
      const updatedVersionfile = `rm -rf ${currentVersionCheck}`
      exec(updatedVersionfile)
      return logInfo(`Removed ${tool} from`, prefix)
    }

    if (currentVersion === globalVersion) {
      return
    }

    logInfo(`installing ${tool} on...`, prefix)
    await execAsync(installCommand, { shell: '/bin/bash' })
      .then(() => exec(updatedVersionfile))
      .catch((error) => {
        logError(error)
        logError(
          'error when installing DXVK, please try launching the game again'
        )
      }
      )
  }
}

export function backupRestoreDLLs(filesToHandle: Array<string>, path: string, action: 'backup' | 'restore'){
  if (action === 'backup'){
    return filesToHandle.forEach(file => {
      const filePath = `${path}/${file}`
      if (existsSync(filePath)){
        spawn('mv', [filePath, `${filePath}.bkp`])
      }
    })
  }

  return filesToHandle.forEach(file => {
    const filePath = `${path}/${file}`
    if (existsSync(filePath)){
      spawn('rm', ['-rf', `${filePath}`])
      spawn('mv', [`${filePath}.bkp`, `${filePath}`])
    }
  })


}
