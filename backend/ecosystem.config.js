module.exports = {
  apps: [
    {
      name:         'mafutaflow-api',
      script:       'src/api.js',
      watch:        false,
      restart_delay: 5000,
      max_restarts:  10,
      env: {
        NODE_ENV:    'production',
      },
    },
    {
      name:         'mafutaflow-scheduler',
      script:       'src/scheduler.js',
      watch:        false,
      restart_delay: 10000,
      max_restarts:  10,
      env: {
        NODE_ENV:    'production',
      },
    },
    {
      name:         'mafutaflow-simulator',
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