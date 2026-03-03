const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'Meeting Printer Agent',
    script: path.join(__dirname, 'agent.js')
});

svc.on('uninstall', function () {
    console.log('✅ Servicio desinstalado correctamente.');
    console.log('El agente ya no se iniciará automáticamente.');
});

console.log('⏳ Desinstalando servicio...');
svc.uninstall();
