# Kosmtik-deploy

Deploy your Kosmtik project on a remote server. Only SSH supported for now.

Experimental, not suited for production use.


## Install

While in your kosmtik root, type:

`node index.js plugins --install kosmtik-deploy`

## Usage

Only command line for now. Eg.:
```
node index.js deploy ~/Code/maps/transilien/project.yml
```

Get details about the available options with:
```
node index.js deploy -h
```

All the options can also be set in your project config file (.mml/.yml),
using the `deploy` key. For example:

```javascript
{
    "protocol": "ssh",  // optional, as it's the default (and only one supported)
    "username": "foo",
    "password": "123456",
    "root": "xxx/yyyy/zzz",  // remote root where to scp your project
    "ignore": ['this/dir', 'this/file.txt']  // paths to be ignored, can be regex
}
```

If you are using public key based authentication, you can use one those option:
- you are on a Unix system and your private key is `~/.ssh/id_rsa`: do nothing, it will be automatic
- add a `privateKeyPath` key with the path to your private key
- add a `privateKey` key with your SSH private key content

SSH is managed under the hood by the [ssh2 module](https://github.com/mscdex/ssh2), so you may
have a look there to get more details about the available options (you can use all of those in your
`project.yml` `deploy` key).

Also, remember that you can use your local config file to manage project config information your don't
want to visible in the versionned `project.yml/.mml` file.

Here is an example of a `localconfig.js` file:
```
exports.LocalConfig = function (localizer, project) {
    project.mml.compareUrl = 'http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png';
    localizer.where('Layer').if({'Datasource.type': 'postgis'}).then({
        'Datasource.dbname': 'idf',
        'Datasource.password': '',
        'Datasource.user': 'ybon',
        'Datasource.host': ''
    });
    project.mml.deploy = {
        host: 'xxxx.kimsufi.com',
        root: 'maps/transilien'
    };
};

```

