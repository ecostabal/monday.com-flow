const axios = require('axios');
const CryptoJS = require('crypto-js');
const qs = require('qs'); // Asegúrate de tener instalado este paquete

// Configuración de Flow
const flowConfig = {
    apiKey: '26FF859D-5E21-4E57-9BBD-7D0BAD8L06CC', // Reemplaza con tu API Key de Flow (almacenado en variables de entorno)
    secretKey: '3756483e4e45238c83a7fb6112a4aba948f83728', // Reemplaza con tu Secret Key de Flow (almacenado en variables de entorno)
    // ...otros parámetros de configuración...
};

// Función para firmar los parámetros con secretKey
const firmarParametros = (parametros, secretKey) => {
    const stringToSign = Object.keys(parametros)
        .sort()
        .map(key => key + parametros[key])
        .join('');

    return CryptoJS.HmacSHA256(stringToSign, secretKey).toString(CryptoJS.enc.Hex);
};

// Función para manejar webhooks de Monday.com y generar link de pago con Flow
exports.generarLinkPagoFlow = async (req, res) => {
    try {
        console.log("Inicio de la función");

        if (!req.body || !req.body.event || !req.body.event.pulseId) {
            throw new Error('La solicitud no contiene la estructura esperada de un evento de Monday.com');
        }

        const itemId = req.body.event.pulseId;

        const query = `query {
            items(ids: [${itemId}]) {
                column_values {
                    id
                    type
                    value
                    text
                }
            }
        }`;

        let mondayResponse = await axios.post('https://api.monday.com/v2', {
            query: query
        }, {
            headers: {
                'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE', // Reemplaza con tu API Key de Monday (almacenado en variables de entorno)
                'Content-Type': 'application/json'
            }
        });

        console.log("Respuesta de Monday.com:", mondayResponse.data);

        const columnsData = mondayResponse.data.data.items[0].column_values;
        const montoColumn = columnsData.find(column => column.id === 'n_meros03');
        const descripcionColumn = columnsData.find(column => column.id === 'ubicaci_n');
        const emailColumn = columnsData.find(column => column.id === 'correo_electr_nico');
        const ordenTrabajoColumn = columnsData.find(column => column.id === 'id__de_elemento1')

        if (!montoColumn || !descripcionColumn || !emailColumn) {
            throw new Error('Datos necesarios no están presentes en el evento');
        }

        const monto = parseFloat(montoColumn.text);
        if (isNaN(monto)) {
            throw new Error('El monto no es un número válido');
        }

        const descripcion = descripcionColumn.text;
        const email = emailColumn.text;
        const ordenNumber = ordenTrabajoColumn.text

        // Creación de la orden de pago para Flow
        const ordenCobro = {
            apiKey: flowConfig.apiKey,
            commerceOrder: ordenNumber, // Asegúrate de reemplazar esto con un valor adecuado
            subject: descripcion,
            currency: 'CLP',
            amount: monto,
            email: email,
            urlConfirmation: 'https://tuservidor.com/confirmacion-pago', // URL de confirmación
            urlReturn: 'https://tuservidor.com/confirmacion-pago', // URL de retorno
            // Agrega aquí cualquier otro parámetro necesario
        };

        // Función para crear una orden de pago
        async function crearOrdenDePago() {
            try {
                // Realiza una solicitud POST a la API de Flow para crear la orden de pago
                const flowResponse = await axios.post('https://www.flow.cl/api/payment/create', qs.stringify(ordenCobro), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                // Verifica si se obtuvo una respuesta válida de Flow
                if (!flowResponse.data || !flowResponse.data.token) {
                    throw new Error('No se pudo obtener el token de pago de Flow');
                }

                // Procesa la respuesta de Flow (por ejemplo, redirecciona al usuario a la página de pago)
                const token = flowResponse.data.token;
                console.log('Token de pago de Flow:', token);

                // Aquí puedes realizar acciones adicionales según tus necesidades, como redirigir al usuario a la página de pago de Flow.

            } catch (error) {
                console.error('Error al hacer la solicitud a Flow:', error);
                // Maneja el error de manera adecuada (por ejemplo, envía una respuesta de error al cliente).
            }
        }

        // Llama a la función para crear la orden de pago
        crearOrdenDePago();

        // Firma de los parámetros con tu secretKey de Flow
        ordenCobro.s = firmarParametros(ordenCobro, flowConfig.secretKey);

        // Envío de la orden de pago a Flow
        let flowResponse = await axios.post('https://www.flow.cl/api/payment/create', qs.stringify(ordenCobro), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!flowResponse.data || !flowResponse.data.token) {
            throw new Error('No se pudo obtener el token de pago de Flow');
        }

        // Construir la URL de redirección
        const token = flowResponse.data.token
        const urlRedireccion = `sandbox.flow.cl/app/web/pay.php?token=${token}`; // Reemplaza con tu URL de redirección

        // Actualizar el enlace en Monday.com
        await axios.post('https://api.monday.com/v2/', {
            query: `mutation { 
                change_column_value (board_id: 5598495616, item_id: ${itemId}, column_id: "enlace", value: "{\"url\": \"${urlRedireccion}\"}") { 
                    id 
                } 
            }`
        }, {
            headers: {
                'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjIzMjg3MzUyNCwiYWFpIjoxMSwidWlkIjoyMzUzNzM2NCwiaWFkIjoiMjAyMy0wMS0zMVQyMTowMjoxNy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6OTUwNzUxNiwicmduIjoidXNlMSJ9.lX1RYu90B2JcH0QxITaF8ymd4d6dBes0FJHPI1mzSRE', // Reemplaza con tu API Key de Monday (almacenado en variables de entorno)
                'Content-Type': 'application/json'
            }
        });

        res.json({ mensaje: "Link de pago generado y actualizado en Monday.com", linkDePago: urlRedireccion });
    } catch (error) {
        console.error('Error capturado en la función:', error);
        res.status(500).json({ mensaje: "Error en la función", error: error.message, stack: error.stack });
    }
};