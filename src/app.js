const koa = require('koa');
const bodyParser = require('koa-bodyparser')
const koaStatic = require('koa-static');
const cors = require('koa2-cors')
const router = require('./router/index');

const app = new koa();
app.use(bodyParser())
app.use(cors())
app.use(koaStatic('./src/public'));
app.use(router.routes())

app.listen(3001, () => {
    console.log('server is running at http://localhost:3001');
});