const execa = require('execa')

const sh = (...args) => execa(...args, { stdio: 'inherit', shell: true })

const watch = process.argv[2] === '-w'
const w = watch ? ' -w' : ''

;(async function () {
  await sh('rm -rf dist')
  await sh('mkdir -p dist')

  const pkg = require('../package.json')

  const babel = './node_modules/.bin/babel'
  sh(`${babel}${w} --no-babelrc src -d ${pkg.main} --config-file=./.babelrc-cjs`)
  sh(`${babel}${w} --no-babelrc src -d ${pkg.module} --config-file=./.babelrc-esm`)
})()
