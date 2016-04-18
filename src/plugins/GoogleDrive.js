import yo from 'yo-yo'
import Utils from '../core/Utils'
import Plugin from './Plugin'

export default class Google extends Plugin {
  constructor (core, opts) {
    super(core, opts)
    this.type = 'acquirer'
    this.files = []
    this.name = 'Google Drive'
    this.icon = `
      <svg class="UppyModalTab-icon" width="28" height="28" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.955 14.93l2.667-4.62H16l-2.667 4.62H2.955zm2.378-4.62l-2.666 4.62L0 10.31l5.19-8.99 2.666 4.62-2.523 4.37zm10.523-.25h-5.333l-5.19-8.99h5.334l5.19 8.99z"/>
      </svg>
    `

    this.getFile = this.getFile.bind(this)
    this.getFolder = this.getFolder.bind(this)
    this.logout = this.logout.bind(this)
    this.renderBrowser = this.renderBrowser.bind(this)

    // set default options
    const defaultOptions = {}

    // merge default options with the ones set by user
    this.opts = Object.assign({}, defaultOptions, opts)

    // Set default state for Google Drive
    this.core.setState({googleDrive: {
      authenticated: false,
      files: [],
      folders: [],
      directory: 'root'
    }})

    this.currentFolder = 'root'
    this.isAuthenticated = false
  }

  focus () {
    this.checkAuthentication()
    .then((res) => {
      if (!this.isAuthenticated) {
        this.target.innerHTML = this.renderAuth()
      } else {
        this.renderFolder()
      }
    })
    .catch((err) => {
      this.target.innerHTML = this.renderError(err)
    })
  }

  checkAuthentication () {
    return fetch(`${this.opts.host}/google/authorize`, {
      method: 'get',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    .then((res) => {
      if (res.status >= 200 && res.status <= 300) {
        return res.json()
      } else {
        let error = new Error(res.statusText)
        error.response = res
        throw error
      }
    })
    .then((data) => data.isAuthenticated)
    .catch((err) => err)
  }

  getFolder (id = this.core.state.googleDrive.directory) {
    return fetch(`${this.opts.host}/google/list?dir=${id}`, {
      method: 'get',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    .then((res) => {
      if (res.status >= 200 && res.status <= 300) {
        return res.json().then((data) => {
          // let result = Utils.groupBy(data.items, (item) => item.mimeType)
          let folders = []
          let files = []
          data.items.forEach((item) => {
            if (item.mimeType === 'application/vnd.google-apps.folder') {
              folders.push(item)
            } else {
              files.push(item)
            }
          })
          return {
            folders,
            files
          }
        })
      } else {
        let error = new Error(res.statusText)
        error.response = res
        throw error
      }
    })
    .catch((err) => {
      return err
    })
  }

  getSubFolder (id) {
    this.getFolder(id)
      .then((newState) => {
        console.log(newState)
        this.updateState(newState)
      })
  }

  getFile (fileId) {
    if (typeof fileId !== 'string') {
      return new Error('getFile: File ID is not a string.')
    }

    return fetch(`${this.opts.host}/google/get?fileId=${fileId}`, {
      method: 'get',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    .then((res) => {
      return res.json()
        .then((json) => json)
    })
    .catch((err) => err)
  }

  install () {
    const caller = this
    this.checkAuthentication()
      .then((authenticated) => {
        this.updateState({authenticated})

        if (authenticated) {
          return this.getFolder()
        }

        return authenticated
      })
      .then((newState) => {
        this.updateState(newState)
        this.el = this.render(this.core.state)
        this.target = this.getTarget(this.opts.target, caller, this.el)
      })

    return
  }

  logout () {
    /**
     * Leave this here
     */
    fetch(`${this.opts.host}/google/logout?redirect=${location.href}`, {
      method: 'get',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.ok) {
          console.log('ok')
          const newState = {
            authenticated: false,
            files: [],
            folders: [],
            directory: 'root'
          }

          this.updateState(newState)
        }
      })
  }

  update (state) {
    if (!this.el) {
      return
    }
    const newEl = this.render(state)
    yo.update(this.el, newEl)

    // setTimeout(() => {
    //   const folders = Utils.qsa('.GoogleDriveFolder')
    //   const files = Utils.qsa('.GoogleDriveFile')
    //   console.log(folders)
    //   console.log(files)

    //   folders.forEach((folder) => folder.addEventListener('click', (e) => this.getFolder(folder.dataset.id)))
    //   files.forEach((file) => file.addEventListener('click', (e) => this.getFile(file.dataset.id)))
    // }, 5000)
  }

  updateState (newState) {
    const {state} = this.core
    const googleDrive = Object.assign({}, state.googleDrive, newState)

    this.core.setState({googleDrive})
  }

  render (state) {
    if (state.googleDrive.authenticated) {
      return this.renderBrowser(state.googleDrive)
    } else {
      return this.renderAuth()
    }
  }

  renderAuth () {
    const link = `${this.opts.host}/connect/google?state=${location.href}`
    return yo`
      <div>
        <h1>Authenticate With Google Drive</h1>
        <a href=${link}>Authenticate</a>
      </div>
    `
  }

  renderBrowser (state) {
    const folders = state.folders.map((folder) => yo`<li>Folder<button class="GoogleDriveFolder" data-id="${folder.id}" data-title="${folder.title}" onclick=${this.getSubFolder.bind(this, folder.id)}>${folder.title}</button></li>`)
    const files = state.files.map((file) => yo`<li><button class="GoogleDriveFile" data-id="${file.id}" data-title="${file.title}" onclick=${this.getFile.bind(this, file.id)}>${file.title}</button></li>`)

    return yo`
      <div>
        <button onclick=${this.logout}/>Logout</button>
        <ul>${folders}</ul>
        <ul>${files}</ul>
      </div>
    `
  }

  renderError (err) {
    return `Something went wrong.  Probably our fault. ${err}`
  }

  renderFolder (folder = this.currentFolder) {
    this.getFolder(folder)
    .then((data) => {
      this.target.innerHTML = this.renderBrowser(data)
      const folders = Utils.qsa('.GoogleDriveFolder')
      const files = Utils.qsa('.GoogleDriveFile')

      folders.forEach((folder) => folder.addEventListener('click', (e) => this.renderFolder(folder.dataset.id)))
      files.forEach((file) => file.addEventListener('click', (e) => this.getFile(file.dataset.id)))
    })
  }
}
