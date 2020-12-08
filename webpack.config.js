const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const config = {
    entry: {
        index: './src/index.js',
        info: './src/info.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js'
    },
    devtool: 'eval-source-map',
    module: {
        rules: [
            {
                test: /\.js$/,
                use: 'babel-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.obj$/,
                use: 'file-loader',
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'src/index.html',
            filename: 'index.html',
            chunks: ['index']
        }),
        new HtmlWebpackPlugin({
            template: 'src/info.html',
            filename: 'info.html',
            chunks: ['info']
        })
    ]
};

module.exports = config;

// generate list of HtmlWebpackPlugin with entry point names
let generateHTML = (filenames) => {
    htmlPlugins = [];
    filenames.forEach(name => {
        let plugin = new HtmlWebpackPlugin({
            template: `src/${name}.html`
        });
        htmlPlugins.push(plugin);
    });
    return htmlPlugins;
}