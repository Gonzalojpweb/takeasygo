const Service = require('node-windows').Service;
const path = require('path');

// Crear el objeto de servicio
const svc = new Service({
    name: 'Takeasygo Printer Agent',
    description: 'Agente de impresión automática para Takeasygo. NO DETENER.',
    script: path.join(__dirname, 'agent.js'),
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ]
});

// Escuchar eventos
svc.on('install', function () {
    console.log('✅ Servicio instalado correctamente.');
    console.log('🔄 Iniciando servicio...');
    svc.start();
});

svc.on('alreadyinstalled', function () {
    console.log('⚠️ El servicio ya estaba instalado.');
    console.log('🔄 Intentando iniciarlo...');
    svc.start();
});

svc.on('start', function () {
    console.log('🚀 ¡Servicio iniciado y corriendo en segundo plano!');
    console.log('Puedes cerrar esta ventana.');
});

svc.on('error', function (e) {
    console.error('❌ Error:', e);
});

// Instalar
console.log('⏳ Instalando servicio de Windows...');
svc.install();
