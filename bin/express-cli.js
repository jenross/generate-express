#!/usr/bin/env node

var ejs = require('ejs')
var fs = require('fs')
var minimatch = require('minimatch')
var mkdirp = require('mkdirp')
var path = require('path')
var readline = require('readline')
var util = require('util')
var inquirer = require('inquirer')
var chalk = require('chalk')
var rimraf = require('rimraf')
var execSync = require('child_process').execSync

var MODE_0666 = parseInt('0666', 8)
var MODE_0755 = parseInt('0755', 8)
var TEMPLATE_DIR = path.join(__dirname, '..', 'templates')
var codeSnippets = require('../js/code-snippets')
var Pkg = require('../js/Package')

var _exit = process.exit

// CLI
let dirDefaultName = 'hello-world'
if (process.argv[2] && process.argv[2].trim().length) {
  dirDefaultName = process.argv[2]
}
const SCRIPT_TYPE = {
  JS: 'Javascript es6+',
  TS: 'Typescript'
}
const isJs = t => t === SCRIPT_TYPE.JS
const isTs = t => !isJs(t)
inquirer
  .prompt([
    {
      name: 'dir',
      message: 'Application name:',
      default: dirDefaultName
    },
    {
      type: 'list',
      name: 'typescript',
      message: 'Use Typescript or Javascript es6+',
      choices: [
        SCRIPT_TYPE.JS,
        SCRIPT_TYPE.TS
      ],
      default: SCRIPT_TYPE.JS
    },
    {
      type: 'confirm',
      name: 'gitignore',
      message: 'Include a .gitignore?',
      default: true
    },
    // TODO: add dynamodb
    {
      when: function (response) {
        return isTs(response.typescript)
      },
      // Remove mongojs if Typescript is selected due to missing @types
      type: 'list',
      name: 'database',
      message: 'Include database config:',
      choices: [
        'none',
        'mongo + mongoose',
        'sequelize'
      ],
      default: 'none'
    },
    {
      when: function (response) {
        return isJs(response.typescript)
      },
      type: 'list',
      name: 'database',
      message: 'Include database config:',
      choices: [
        'none',
        'mongojs',
        'mongo + mongoose',
        'sequelize'
      ],
      default: 'none'
    },
    {
      when: function (response) {
        // Only ask for view engine if Javascript is selected
        return isJs(response.typescript)
      },
      type: 'list',
      name: 'view',
      message: 'View engine or just API:',
      choices: [
        'none - api only',
        'dust',
        'ejs',
        'hbs',
        'hjs',
        'pug',
        'twig',
        'vash'
      ],
      default: 'none'
    },
    {
      type: 'list',
      name: 'cache',
      message: 'Include cache:',
      choices: [
        'none',
        'redis'
      ]
    }
  ])
  .then(program => {
    const {
      dir
    } = program
    const hasTs = isTs(program.typescript)
    const hasView = (program.view !== 'none - api only') && !hasTs
    const tsjs = hasTs ? 'ts' : 'js'

    if (!exit.exited) {
      main()
    }

    /**
     * Copy file from template directory.
     */

    function copyTemplate (from, to) {
      write(to, fs.readFileSync(path.join(TEMPLATE_DIR, from), 'utf-8'))
    }

    /**
     * Copy multiple files from template directory.
     */

    function copyTemplateMulti (fromDir, toDir, nameGlob) {
      fs.readdirSync(path.join(TEMPLATE_DIR, fromDir))
        .filter(minimatch.filter(nameGlob, { matchBase: true }))
        .forEach(function (name) {
          copyTemplate(path.join(fromDir, name), path.join(toDir, name))
        })
    }

    /**
     * Create application at the given directory.
     *
     * @param {string} name
     * @param {string} dir
     */

    function createApplication (name, directory) {
      // Package
      const pkg = new Pkg({ name, hasTs, hasView, program }).init()

      const app = loadTemplate(`${tsjs}/app.${tsjs}`)
      const www = loadTemplate(`${tsjs}/www`)
      const env = loadTemplate(`${tsjs}/.env`)

      // App name
      www.locals.name = name

      // App modules
      app.locals.localModules = Object.create(null)
      app.locals.modules = Object.create(null)
      app.locals.mounts = []
      app.locals.uses = []

      // Request logger
      app.locals.modules.logger = 'morgan'
      app.locals.uses.push("logger('dev')")

      // Body parsers
      app.locals.uses.push('express.json()')
      app.locals.uses.push('express.urlencoded({ extended: false })')

      // Cookie parser
      app.locals.modules.cookieParser = 'cookie-parser'
      app.locals.uses.push('cookieParser()')

      // Helmet
      app.locals.modules.helmet = 'helmet'
      app.locals.uses.push('helmet()')

      // CORS
      app.locals.modules.cors = 'cors'
      app.locals.uses.push('cors()')

      // Compression middleware
      app.locals.modules.compression = 'compression'
      app.locals.uses.push('compression()')

      if (directory !== '.') {
        mkdir(directory, '.')
      }

      if (hasView) {
        // Copy view templates
        mkdir(directory, 'public')
        mkdir(directory, 'public/javascripts')
        mkdir(directory, 'public/images')
        mkdir(directory, 'public/stylesheets')
        mkdir(directory, 'server/views')
        switch (program.view) {
          case 'dust':
            copyTemplateMulti('views', directory + '/server/views', '*.dust')
            break
          case 'ejs':
            copyTemplateMulti('views', directory + '/server/views', '*.ejs')
            break
          case 'hbs':
            copyTemplateMulti('views', directory + '/server/views', '*.hbs')
            break
          case 'hjs':
            copyTemplateMulti('views', directory + '/server/views', '*.hjs')
            break
          case 'jade':
            copyTemplateMulti('views', directory + '/server/views', '*.jade')
            break
          case 'pug':
            copyTemplateMulti('views', directory + '/server/views', '*.pug')
            break
          case 'twig':
            copyTemplateMulti('views', directory + '/server/views', '*.twig')
            break
          case 'vash':
            copyTemplateMulti('views', directory + '/server/views', '*.vash')
            break
          case 'none - api only':
            break
        }
      }

      if (hasView) {
        // copy css templates
        switch (program.css) {
          case 'less':
            copyTemplateMulti('css', directory + '/public/stylesheets', '*.less')
            break
          case 'stylus':
            copyTemplateMulti('css', directory + '/public/stylesheets', '*.styl')
            break
          case 'compass':
            copyTemplateMulti('css', directory + '/public/stylesheets', '*.scss')
            break
          case 'sass':
            copyTemplateMulti('css', directory + '/public/stylesheets', '*.sass')
            break
          default:
            copyTemplateMulti('css', directory + '/public/stylesheets', '*.css')
            break
        }
      } else {
        console.log('Since api only was chosen, no css linking occurred.')
        console.log('To add css, create /public/stylesheets/style.css')
      }

      // copy route templates
      mkdir(directory, 'server/routes')
      // TODO: rename the javascript route file names to match ts (helloRoute)
      if (hasTs) {
        copyTemplate(`${tsjs}/routes/users.${tsjs}`, path.join(dir, `/server/routes/users.${tsjs}`))
        copyTemplate(`${tsjs}/routes/index.${tsjs}`, path.join(dir, `/server/routes/index.${tsjs}`))
        copyTemplate(`${tsjs}/routes/hello.${tsjs}`, path.join(dir, `/server/routes/hello.${tsjs}`))
      } else {
        copyTemplate(`${tsjs}/routes/users.${tsjs}`, path.join(dir, `/server/routes/users.${tsjs}`))
        if (hasView) {
          copyTemplate(`${tsjs}/routes/index.${tsjs}`, path.join(dir, `/server/routes/hello.${tsjs}`))
        } else {
          copyTemplate(`${tsjs}/routes/apiOnly.${tsjs}`, path.join(dir, `/server/routes/hello.${tsjs}`))
        }
      }

      // Database
      www.locals.db = false
      app.locals.db = false
      env.locals.db = false
      mkdir(dir, 'server/controllers')
      switch (program.database) {
        case 'mongojs':
          app.locals.modules.mongojs = 'mongojs'
          app.locals.db = codeSnippets.mongoJsCode
          copyTemplate(`${tsjs}/controllers/userController.default.${tsjs}`, path.join(dir, `/server/controllers/userController.${tsjs}`))
          break
        case 'sequelize':
          // TODO: prompt for which flavor of SQL (mysql/pg/maria/sqlite)
          if (hasTs) {
            www.locals.db = codeSnippets.sequelizeCodeTS
          } else {
            www.locals.db = codeSnippets.sequelizeCode
          }
          env.locals.db = codeSnippets.sequelizeEnvironmentVars

          mkdir(dir, 'server/config')
          copyTemplateMulti(`${tsjs}/models/sequelize/config`, `${dir}/server/config`, `*.${tsjs}`)
          mkdir(dir, 'server/models')
          copyTemplateMulti(`${tsjs}/models/sequelize`, `${dir}/server/models`, `*.${tsjs}`)
          copyTemplate(`${tsjs}/controllers/userController.sql.${tsjs}`, path.join(dir, `/server/controllers/userController.${tsjs}`))
          break
        case 'mongo + mongoose':
          app.locals.modules.mongoose = 'mongoose'
          app.locals.db = codeSnippets.mongoMongooseCode
          mkdir(dir, 'server/models')
          copyTemplateMulti(`${tsjs}/models/mongoose`, `${dir}/server/models`, `*.${tsjs}`)
          copyTemplate(`${tsjs}/controllers/userController.mongo.${tsjs}`, path.join(dir, `/server/controllers/userController.${tsjs}`))
          break
        default:
          copyTemplate(`${tsjs}/controllers/userController.default.${tsjs}`, path.join(dir, `/server/controllers/userController.${tsjs}`))
      }

      // Caching
      app.locals.cache = false
      env.locals.cache = false
      switch (program.cache) {
        case 'redis':
          app.locals.modules.redis = 'redis'
          app.locals.cache = codeSnippets.redisCode
          env.locals.cache = codeSnippets.redisEnvironmentVars
      }

      // if (program.view) {
      //   // CSS Engine support
      //   switch (program.css) {
      //     case 'compass':
      //       app.locals.modules.compass = 'node-compass'
      //       app.locals.uses.push("compass({ mode: 'expanded' })")
      //       // pkg.dependencies['node-compass'] = '0.2.3'
      //       break
      //     case 'less':
      //       app.locals.modules.lessMiddleware = 'less-middleware'
      //       app.locals.uses.push("lessMiddleware(path.join(__dirname, 'public'))")
      //       // pkg.dependencies['less-middleware'] = '~2.2.1'
      //       break
      //     case 'sass':
      //       app.locals.modules.sassMiddleware = 'node-sass-middleware'
      //       app.locals.uses.push("sassMiddleware({\n  src: path.join(__dirname, 'public'),\n  dest: path.join(__dirname, 'public'),\n  indentedSyntax: true, // true = .sass and false = .scss\n  sourceMap: true\n})")
      //       // pkg.dependencies['node-sass-middleware'] = '0.11.0'
      //       break
      //     case 'stylus':
      //       app.locals.modules.stylus = 'stylus'
      //       app.locals.uses.push("stylus.middleware(path.join(__dirname, 'public'))")
      //       // pkg.dependencies['stylus'] = '0.54.5'
      //       break
      //   }
      // }

      // Index router mount
      // TODO: make routes/index only export
      // app.locals.localModules['* as routes'] = './routes/index'

      app.locals.localModules.helloRouter = './routes/hello'
      app.locals.mounts.push({ path: '/api', code: 'helloRouter' })

      // User router mount
      app.locals.localModules.usersRouter = './routes/users'
      app.locals.mounts.push({ path: '/api/users', code: 'usersRouter' })

      // Template support
      switch (program.view) {
        case 'dust':
          app.locals.modules.adaro = 'adaro'
          app.locals.view = {
            engine: 'dust',
            render: 'adaro.dust()'
          }
          break
        case 'ejs':
          app.locals.view = { engine: 'ejs' }
          break
        case 'hbs':
          app.locals.view = { engine: 'hbs' }
          break
        case 'hjs':
          app.locals.view = { engine: 'hjs' }
          break
        case 'jade':
          app.locals.view = { engine: 'jade' }
          break
        case 'pug':
          app.locals.view = { engine: 'pug' }
          break
        case 'twig':
          app.locals.view = { engine: 'twig' }
          break
        case 'vash':
          app.locals.view = { engine: 'vash' }
          break
        default:
          app.locals.view = false
          break
      }

      if (program.gitignore) {
        copyTemplate(`${tsjs}/gitignore`, path.join(dir, '.gitignore'))
      }

      // write files
      write(path.join(dir, `server/app.${tsjs}`), app.render())
      write(path.join(dir, 'package.json'), JSON.stringify(pkg.package, null, 2) + '\n')
      if (hasTs) {
        copyTemplate('ts/tsconfig.json', path.join(dir, 'tsconfig.json'))
      } else {
        copyTemplate('js/babelrc', path.join(dir, '.babelrc'))
      }
      mkdir(dir, 'server/bin')
      write(path.join(dir, `server/bin/www.${tsjs}`), www.render(), MODE_0755)
      write(path.join(dir, '.env'), env.render())
      copyTemplate(`${tsjs}/eslintrc.js`, path.join(dir, '.eslintrc.js'))
      npmInstall()
      gitInit()
      printInfoLogs()
    }

    // Install npm dependencies
    let depsInstalled = false
    function npmInstall () {
      console.log(chalk.blue.bold('Installing npm packages...'))
      try {
        execSync(`cd ${dir} && npm install`, { stdio: 'inherit' })
        depsInstalled = true
      } catch (err) {
        console.log(
          chalk.red(
            `Warning: dependencies failed to install. Please run ${chalk.blue('npm install')}`
          ))
      }
    }
    function gitInit () {
      execSync(`cd ${dir} && git init`, { stdio: 'inherit' })
    }

    // Print informational logs
    function printInfoLogs () {
      if (dir !== '.') {
        console.log()
        console.log('  change directory:')
        console.log(chalk.blue.bold(`    cd ${dir}`))
      }

      if (!depsInstalled) {
        console.log()
        console.log('  install dependencies:')
        console.log(chalk.blue.bold(`    npm install`))
      }
      console.log()
      console.log('  run the app in dev watch mode:')
      console.log(chalk.blue.bold('    npm start'))
      console.log()
      console.log('Hello world: ', chalk.cyan.underline('localhost:3001/api'))
      console.log('GET /users: ', chalk.cyan.underline('localhost:3001/api/users'))

      if (program.database === 'sequelize') {
        console.log()
        console.log(chalk.yellow('   NOTE: You must update the `.env` file with your database settings before starting.'))
      }
    }

    /**
     * Check if the given directory `dir` is empty.
     *
     * @param {String} dir
     * @param {Function} fn
     */

    function emptyDirectory (directory, fn) {
      console.log(directory)
      fs.readdir(directory, function (err, files) {
        if (err && err.code !== 'ENOENT') throw err
        fn(!files || !files.length)
      })
    }

    /**
     * Graceful exit for async STDIO
     */

    function exit (code) {
      // flush output for Node.js Windows pipe bug
      // https://github.com/joyent/node/issues/6247 is just one bug example
      // https://github.com/visionmedia/mocha/issues/333 has a good discussion
      function done () {
        if (!(draining--)) _exit(code)
      }

      let draining = 0
      const streams = [process.stdout, process.stderr]

      exit.exited = true

      streams.forEach(function (stream) {
        // submit empty write request and wait for completion
        draining += 1
        stream.write('', done)
      })

      done()
    }

    /**
     * Load template file.
     */

    function loadTemplate (name) {
      const contents = fs.readFileSync(path.join(__dirname, '..', 'templates', (name + '.ejs')), 'utf-8')
      const locals = Object.create(null)

      function render () {
        return ejs.render(contents, locals, {
          escape: util.inspect
        })
      }

      return {
        locals: locals,
        render: render
      }
    }

    /**
     * Main program.
     */

    function main () {
      // Path
      const destinationPath = './' + dir

      // App name
      const appName = dir

      // Grab input on y/n prompt
      function confirm (msg, callback) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })

        rl.question(msg, function (input) {
          rl.close()
          callback(/^y|yes|ok|true$/i.test(input))
        })
      }

      // Generate application
      emptyDirectory(destinationPath, function (empty) {
        if (empty || program.force) {
          createApplication(appName, destinationPath)
        } else {
          const message = chalk.red.bold(`WARNING: ./${appName} is not empty, erase contents and continue? [y/N] `)
          confirm(message, function (ok) {
            if (ok) {
              rimraf(destinationPath, function () {
                process.stdin.destroy()
                createApplication(appName, destinationPath)
              })
            } else {
              console.log(chalk.red.bold('aborting'))
              exit(1)
            }
          })
        }
      })
    }

    /**
     * Make the given dir relative to base.
     *
     * @param {string} base
     * @param {string} dir
     */

    function mkdir (base, directory) {
      const loc = path.join(base, directory)
      console.log(chalk.cyan('   create : ' + chalk.green(loc + path.sep)))
      mkdirp.sync(loc, MODE_0755)
    }

    /**
     * echo str > file.
     *
     * @param {String} file
     * @param {String} str
     */

    function write (file, str, mode) {
      fs.writeFileSync(file, str, { mode: mode || MODE_0666 })
      console.log(chalk.cyan('   create : ' + chalk.green(file)))
    }
    process.exit = exit
  })
  .catch(error => {
    if (error.isTtyError) {
      // Prompt couldn't be rendered in the current environment
      console.log(chalk.red.bold('Could not run in the current environment: ' + error))
    } else {
      // Something else when wrong
      console.log(chalk.red.bold('Something went wrong: ' + error))
    }
  })
