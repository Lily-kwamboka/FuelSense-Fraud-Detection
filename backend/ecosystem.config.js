module.exports = {
  apps: [
    {
      name:         'MafutaFlow Africa-api',
      script:       'src/api.js',
      watch:        false,
      restart_delay: 5000,
      max_restarts:  10,
      env: {
        NODE_ENV:    'production',
      },
    },
    {
      name:         'MafutaFlow Africa-scheduler',
      script:       'src/scheduler.js',
      watch:        false,
      restart_delay: 10000,
      max_restarts:  10,
      env: {
        NODE_ENV:    'production',
      },
    },
    {
      name:         'MafutaFlow Africa-simulator',
      script:       'src/atg-simulator.js',
      watch:        false,
      restart_delay: 5000,
      max_restarts:  10,
      env: {
        NODE_ENV:    'production',
      },
    },
  ],
};