var path = require('path')
var webpack = require('webpack')
module.exports = { 
    entry: './src/index.ts', 
    target: ['web', 'es5'],
    output: { 
        path:path.join(__dirname,'dist'),
        filename: 'dist.js', 
        library: 'xpanda_optimizer_export'
    },
    performance: {
        hints: false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    },
    resolve: {
        extensions: ['.js','.ts']
    },
    optimization: {
        minimize: true,
        minimizer: [
            (compiler) => {
                const TerserPlugin = require('terser-webpack-plugin');
                new TerserPlugin({
                    extractComments: false
                }).apply(compiler);
            },
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({
            process: 'process/browser',
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        })
    ],
    module: {
        rules: [
            {
                // test指定规则生效文件
                test:/\.ts$/,
                use:'ts-loader',
                // 排除文件夹
                exclude:/node-modules/
            }
        ]
      },
    mode:"production"
  } 