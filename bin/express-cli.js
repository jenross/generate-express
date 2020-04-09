#!/usr/bin/env node

var ejs = require('ejs')
var fs = require('fs')
var minimatch = require('minimatch')
var mkdirp = require('mkdirp')
var path = require('path')
// var program = require('commander')
var readline = require('readline')
var sortedObject = require('sorted-object')
var util = require('util')
var inquirer = require('inquirer')
var kebabCase = require('lodash.kebabcase');

var MODE_0666 = parseInt('0666', 8)
var MODE_0755 = parseInt('0755', 8)
var TEMPLATE_DIR = path.join(__dirname, '..', 'templates')

var _exit = process.exit

// Re-assign process.exit because of commander
// TODO: Switch to a different command framework

// CLI

let dirDefaultName = 'hello-world'
if (process.argv[2] && process.argv[2].trim().length) {
  dirDefaultName = process.argv[2]
}
inquirer
  .prompt([
    {
      name: 'dir',
      message: 'Application name:',
      default: dirDefaultName
    },
    {
      type: 'confirm',
      name: 'gitignore',
      message: 'Include a .gitignore?',
      default: true
    },
    {
      type: 'list',
      name: 'database',
      message: 'Include database config:',
      // TODO: add dynamodb
      choices: [
        'none',
        'mongojs',
        'mongo + mongoose',
        'sequelize'
      ],
      default: 'none'
    },
    {
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
    }
  ])
  .then(program => {
    const {
      dir
    } = program
    const hasView = program.view !== 'none - api only'

    if (!exit.exited) {
      main()
    }

    function confirm (msg, callback) {
      var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      rl.question(msg, function (input) {
        rl.close()
        callback(/^y|yes|ok|true$/i.test(input))
      })
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
      var pkg = {
        name: kebabCase(name),
        version: '1.0.0',
        private: true,
        scripts: {
          'start': 'npm run prod',
          'build': 'npm-run-all clean transpile',
          'server': 'node ./dist/bin/www',
          'dev': 'NODE_ENV=development npm-run-all build server',
          'prod': 'NODE_ENV=production npm-run-all build server',
          'transpile': 'babel ./server --out-dir dist',
          'clean': 'rimraf dist',
          'watch:dev': 'nodemon'
        },
        nodemonConfig: {
          'exec': 'npm run dev',
          'watch': [
            'server/*',
            'public/*'
          ],
          'ignore': [
            '**/__tests__/**',
            '*.test.js',
            '*.spec.js'
          ]
        },
        dependencies: {
          'debug': '~2.6.9',
          'express': '~4.16.1'
        },
        devDependencies: {
          '@babel/cli': '^7.8.4',
          '@babel/core': '^7.9.0',
          '@babel/node': '^7.8.7',
          '@babel/preset-env': '^7.9.0',
          'jest': '^25.2.7',
          'npm-run-all': '^4.1.5',
          'rimraf': '^3.0.2'
        }
      }

      // JavaScript
      var app = loadTemplate('js/app.js')
      var www = loadTemplate('js/www')

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
      pkg.dependencies.morgan = '~1.9.1'

      // Body parsers
      app.locals.uses.push('express.json()')
      app.locals.uses.push('express.urlencoded({ extended: false })')

      // Cookie parser
      app.locals.modules.cookieParser = 'cookie-parser'
      app.locals.uses.push('cookieParser()')
      pkg.dependencies['cookie-parser'] = '~1.4.4'

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
        pkg.dependencies['http-errors'] = '~1.6.3'
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
      copyTemplateMulti('js/routes', directory + '/server/routes', '*.js')

      // Database
      www.locals.db = false
      app.locals.db = false
      switch (program.database) {
        case 'mongojs':
          pkg.dependencies['mongojs'] = '^3.1.0'
          app.locals.modules.mongojs = 'mongojs'
          app.locals.db = `
const dbUri = process.env.MONGODB_URI || 'mydb';
const collections = ['mycollection'];

const db = mongojs(dbUri, collections);
`
          break
        case 'sequelize':
          pkg.dependencies['mysql2'] = '^1.6.4'
          pkg.dependencies['sequelize'] = '^4.41.2'
          app.locals.localModules.db = './models'
          www.locals.db = `
// Run sequelize before listen
db.sequelize.sync({ force: true }).then(function() {
  app.listen(PORT, function() {
    console.log("App listening on PORT " + PORT);
  });
});
`
          mkdir(dir, 'server/models')
          copyTemplateMulti('js/models/sequelize', dir + '/server/models', '*.js')
          mkdir(dir, 'server/config')
          copyTemplateMulti('js/models/sequelize/config', dir + '/server/config', '*.json')
          copyTemplate('js/models/sequelize/config/config.json', path.join(dir, '/server/config/config.json'))
          break
        case 'mongo + mongoose':
          pkg.dependencies['mongoose'] = '^5.3.16'
          pkg.dependencies['morgan'] = '^1.9.1'
          app.locals.modules.mongoose = 'mongoose'
          app.locals.modules.logger = 'morgan'
          app.locals.uses.push("logger('dev')")
          app.locals.db = `
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/mydb';
const mongooseConfigs = { useNewUrlParser: true };
mongoose.connect(mongoUri, mongooseConfigs)
`
          mkdir(dir, 'server/models')
          copyTemplateMulti('js/models/mongoose', dir + '/server/models', '*.js')
      }

      if (program.view) {
        // CSS Engine support
        switch (program.css) {
          case 'compass':
            app.locals.modules.compass = 'node-compass'
            app.locals.uses.push("compass({ mode: 'expanded' })")
            pkg.dependencies['node-compass'] = '0.2.3'
            break
          case 'less':
            app.locals.modules.lessMiddleware = 'less-middleware'
            app.locals.uses.push("lessMiddleware(path.join(__dirname, 'public'))")
            pkg.dependencies['less-middleware'] = '~2.2.1'
            break
          case 'sass':
            app.locals.modules.sassMiddleware = 'node-sass-middleware'
            app.locals.uses.push("sassMiddleware({\n  src: path.join(__dirname, 'public'),\n  dest: path.join(__dirname, 'public'),\n  indentedSyntax: true, // true = .sass and false = .scss\n  sourceMap: true\n})")
            pkg.dependencies['node-sass-middleware'] = '0.11.0'
            break
          case 'stylus':
            app.locals.modules.stylus = 'stylus'
            app.locals.uses.push("stylus.middleware(path.join(__dirname, 'public'))")
            pkg.dependencies['stylus'] = '0.54.5'
            break
        }
      }

      // Index router mount
      app.locals.localModules.indexRouter = './routes/index'
      app.locals.mounts.push({ path: '/server', code: 'indexRouter' })

      // User router mount
      app.locals.localModules.usersRouter = './routes/users'
      app.locals.mounts.push({ path: '/server/users', code: 'usersRouter' })

      // Template support
      switch (program.view) {
        case 'dust':
          app.locals.modules.adaro = 'adaro'
          app.locals.view = {
            engine: 'dust',
            render: 'adaro.dust()'
          }
          pkg.dependencies.adaro = '~1.0.4'
          break
        case 'ejs':
          app.locals.view = { engine: 'ejs' }
          pkg.dependencies.ejs = '~2.6.1'
          break
        case 'hbs':
          app.locals.view = { engine: 'hbs' }
          pkg.dependencies.hbs = '~4.0.4'
          break
        case 'hjs':
          app.locals.view = { engine: 'hjs' }
          pkg.dependencies.hjs = '~0.0.6'
          break
        case 'jade':
          app.locals.view = { engine: 'jade' }
          pkg.dependencies.jade = '~1.11.0'
          break
        case 'pug':
          app.locals.view = { engine: 'pug' }
          pkg.dependencies.pug = '2.0.0-beta11'
          break
        case 'twig':
          app.locals.view = { engine: 'twig' }
          pkg.dependencies.twig = '~0.10.3'
          break
        case 'vash':
          app.locals.view = { engine: 'vash' }
          pkg.dependencies.vash = '~0.12.6'
          break
        default:
          app.locals.view = false
          break
      }

      if (program.git) {
        copyTemplate('js/gitignore', path.join(dir, '.gitignore'))
      }

      // sort dependencies like npm(1)
      pkg.dependencies = sortedObject(pkg.dependencies)

      // write files
      write(path.join(dir, 'server/app.js'), app.render())
      write(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
      copyTemplate('js/babelrc', path.join(dir, '.babelrc'))
      mkdir(dir, 'server/bin')
      copyTemplate('js/gitignore', path.join(dir, '.gitignore'))
      write(path.join(dir, 'server/bin/www.js'), www.render(), MODE_0755)

      var prompt = launchedFromCmd() ? '>' : '$'

      if (dir !== '.') {
        console.log()
        console.log('   change directory:')
        console.log('     %s cd %s', prompt, dir)
      }

      console.log()
      console.log('   install dependencies:')
      console.log('     %s npm install', prompt)
      console.log()
      console.log('   run the app:')

      if (launchedFromCmd()) {
        console.log('     %s SET DEBUG=%s:* & npm start', prompt, name)
      } else {
        console.log('     %s DEBUG=%s:* npm start', prompt, name)
      }

      console.log()
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

      var draining = 0
      var streams = [process.stdout, process.stderr]

      exit.exited = true

      streams.forEach(function (stream) {
        // submit empty write request and wait for completion
        draining += 1
        stream.write('', done)
      })

      done()
    }

    /**
     * Determine if launched from cmd.exe
     */

    function launchedFromCmd () {
      return process.platform === 'win32' &&
        process.env._ === undefined
    }

    /**
     * Load template file.
     */

    function loadTemplate (name) {
      var contents = fs.readFileSync(path.join(__dirname, '..', 'templates', (name + '.ejs')), 'utf-8')
      var locals = Object.create(null)

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
      var destinationPath = './' + dir

      // App name
      var appName = dir

      // Generate application
      emptyDirectory(destinationPath, function (empty) {
        if (empty || program.force) {
          createApplication(appName, destinationPath)
        } else {
          confirm(`./${appName} is not empty, erase contents and continue? [y/N] `, function (ok) {
            if (ok) {
              process.stdin.destroy()
              createApplication(appName, destinationPath)
            } else {
              console.error('aborting')
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
      var loc = path.join(base, directory)

      console.log('   \x1b[36mcreate\x1b[0m : ' + loc + path.sep)
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
      console.log('   \x1b[36mcreate\x1b[0m : ' + file)
    }
    process.exit = exit
  })
  .catch(error => {
    if (error.isTtyError) {
      // Prompt couldn't be rendered in the current environment
      console.log(error)
    } else {
      // Something else when wrong
      console.log(error)
    }
  })
