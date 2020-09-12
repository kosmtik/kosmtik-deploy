/*eslint no-use-before-define: 0 */
var path = require('path'),
    fs = require('fs'),
    ssh = require('ssh2'),
    Utils = require(path.join(kosmtik.src, 'back/Utils.js')),
    Project = require(path.join(kosmtik.src, 'back/Project.js')).Project;

function log() {
    console.warn.apply(console, Array.prototype.concat.apply(['[deploy]'], arguments));
};

class Deploy {
    constructor(config) {
        this.config = config;
        this.config.commands.deploy = this.config.opts.command('deploy').help('Deploy your project on a remote server');
        this.config.commands.deploy.option('project', {
            position: 1,
            help: 'Project path to deploy.'
        });
        this.config.commands.deploy.option('host', {
            help: 'Host to start ssh on.'
        });
        this.config.commands.deploy.option('port', {
            default: 22,
            help: 'Port to start ssh on.'
        });
        this.config.commands.deploy.option('username', {
            default: null,
            help: 'Username to use for ssh connection.'
        });
        this.config.commands.deploy.option('password', {
            default: null,
            help: 'Password to use for ssh connection.'
        });
        this.config.commands.deploy.option('xml', {
            default: 'project.xml',
            full: 'mapnik-xml-name',
            help: 'Name of the mapnik xml that will be exported and deployed.'
        });
        this.config.commands.deploy.option('root', {
            full: 'root',
            help: 'Root on the remote server.'
        });
        this.config.commands.deploy.option('dry', {
            full: 'dry-run',
            flag: true,
            help: 'Compute files and stats without really pushing anything to remote server.'
        });
        this.config.on('command:deploy', this.handleCommand.bind(this));
    };

    handleCommand() {
        var project = new Project(this.config, this.config.parsed_opts.project),
            self = this,
            callback = function (err, buffer) {
                if (err) throw err;
                var options = project.mml.deploy || {},
                    xmlPath = path.join(project.root, options.xml || self.config.parsed_opts.xml);
                fs.writeFile(xmlPath, buffer, function done () {
                    log('Exported project to', xmlPath);
                    self.deploy(project, options);
                });
            };
        project.when('loaded', function () {
            project.export({format: 'xml'}, callback);
        });
        project.load();
    };

    deploy(project, options) {
        log('Deploying project', project.id);
        var keys = ['host', 'port', 'username', 'password', 'root', 'dry'];
        keys.forEach(function (key) {
            if (this.config.parsed_opts[key]) {
                options[key] = this.config.parsed_opts[key];
            }
        }, this);
        options.username = options.username || process.env.USER;
        options.ignore = options.ignore || [];
        options.protocol = options.protocol || 'ssh';
        options.privateKeyPath = options.privateKeyPath || path.join(process.env.HOME, '.ssh/id_rsa');
        if (!options.password && !options.privateKey && fs.existsSync(options.privateKeyPath)) options.privateKey = fs.readFileSync(options.privateKeyPath);

        if (options.protocol === 'ssh') return this.ssh(project, options);
        else log('ERROR: unknown protocol', options.protocol);
    };


    getFiles(project, paths) {
        paths = paths || [''];
        var files = [], filepath;
        for (var i = 0; i < paths.length; i++) {
            filepath = path.join(project.root, paths[i]);
            if (fs.lstatSync(filepath).isDirectory()) files = files.concat(Utils.tree(filepath));
            else files.push({path: filepath, stat: fs.statSync(filepath)});
        }
        return files;
    };

    ssh(project, options) {
        var c = new ssh(), sftp,
            processed = 0,
            files = this.getFiles(project, options.include),
            put = function (local) {
                var remote = path.join(options.root, local),
                    remoteDir = path.dirname(local);
                local = path.join(project.root, local);
                sftp.stat(remote, function (err, stats) {
                    // https://github.com/mscdex/ssh2-streams/blob/master/lib/sftp.js#L41
                    if (err && err.code !== 2) throw err;  // 2 === No such file or directory, which is normal at first run.
                    if (stats) {
                        var localStats = fs.statSync(local);
                        if (stats.size === localStats.size && stats.mtime * 1000 >= localStats.mtime.getTime()) {
                            log('Remote already up to date', local, 'SKIPPING');
                            return loop();
                        }
                    }
                    if (options.dry) return loop();
                    mkdirs(remoteDir);
                    sftp.fastPut(local, remote, {}, loop);
                });
            },
            mkdirs = function (local) {
                var remote = path.join(options.root, local);
                local = path.join(project.root, local);
                if (options.dry) return;
                c.exec('mkdir -p ' + remote, function (err, stream) {
                    if (err) return log(err.message);
                    stream.on('exit', function(code/*, *signal*/) {
                        if (code !== 0) throw new Error('Unable to create dir ' + remote);
                    });
                });
            },
            filter = function (f) {
                var ext = path.extname(f);
                if (ext === '.zip') return true;
                if (f.indexOf('.') === 0) return true;
                for (var i = 0; i < options.ignore.length; i++) {
                    try {
                        if (f.match(options.ignore[i])) return true;
                    } catch (err) {
                        if (f.indexOf(options.ignore[i]) === 0) return true;
                    }
                }
                return false;
            },
            end = function (message) {
                log('Closing connexion');
                processed = files.length;  // Make sure we end the loop.
                if (message) log('Error: ' + message);
                else log('Done.');
                c.end();
            },
            loop = function (err) {
                if (err) return end(err.message);
                if(processed === files.length) return end();
                var f = files[processed++];
                var local = f.path.replace(project.root, '').replace(/^\//, '');
                if (filter(local)) return loop();
                else put(local);
                log('Processing', f.path, f.stat.size);
            };
        c.on('ready', function () {
            log('Connection established with', options.host);
            c.sftp(function (err, s) {
                if (err) log(err.message);
                sftp = s;
                mkdirs('/');  // Make sure remote root exists.
                loop();
            });
        });
        c.on('error', function (err) {
            log('Error:', err.message);
        });
        // options.debug = console.log;
        c.connect(options);
    };
}

exports = module.exports = { Plugin: Deploy };
