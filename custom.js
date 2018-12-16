var acorn   = require('acorn')
  , through = require('through')

var processEnvPattern = /\bprocess\.env\b/

module.exports = function(rootEnv) {
  rootEnv = rootEnv || process.env || {}

  return function envify(file, argv) {
    if (/\.json$/.test(file)) return through()

    var buffer = []
    argv = argv || {}

    return through(write, flush)

    function write(data) {
      buffer.push(data)
    }

    function transform(source, envs) {
      var args  = [].concat(envs[0]._ || []).concat(envs[1]._ || [])
      var purge = args.indexOf('purge') !== -1
      var replacements = []

      function match(node) {
        return (
          node.type === 'ExpressionStatement'
          && node.expression.type === 'MemberExpression'
          && node.expression.object.computed === false
          && node.expression.object.object.type === 'Identifier'
          && node.expression.object.object.name === 'process'
          && node.expression.object.property.type === 'Identifier'
          && node.expression.object.property.name === 'env'
          && (node.expression.computed
            ? node.expression.property.type === 'Literal'
            : node.expression.property.type === 'Identifier')
        )
      }

      var parsed = acorn.parse(source)
      for (var i = 0; i < parsed.body.length; i++) {
        var node = parsed.body[i]
        if (!node.expression) console.log(node)
        if (match(node)) {
          var key = node.expression.property.name || node.expression.property.value
          for (var k = 0; k < envs.length; k++) {
            var value = envs[k][key]
            if (value !== undefined) {
              replacements.push({ node: node, value: JSON.stringify(value) })
              continue
            }
          }
          if (purge) {
            replacements.push({ node: node, value: undefined })
          }
        } else if (node.expression && node.expression.type === 'AssignmentExpression') {
          for (var j = 0; j < replacements.length; ++j) {
            if (replacements[j].node === node.expression.left) {
              replacements.splice(k, 1)
            }
          }
        }
      }

      var result = source
      if (replacements.length > 0) {
        replacements.sort(function (a, b) {
          return b.node.start - a.node.start
        })
        for (var i = 0; i < replacements.length; i++) {
          var r = replacements[i]
          result = result.slice(0, r.node.start) + r.value + result.slice(r.node.end)
        }
      }

      return result
    }

    function flush() {
      var source = buffer.join('')

      if (processEnvPattern.test(source)) {
        try {
          source = transform(source, [argv, rootEnv])
        } catch(err) {
          return this.emit('error', err)
        }
      }

      this.queue(source)
      this.queue(null)
    }
  }
}
