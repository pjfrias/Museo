const url = 'https://collectionapi.metmuseum.org/public/collection/v1';
const maxElementos = 400; // Limite de elementos
const elementosPorPagina = 20; // Elementos por página
let paginaActual = 1;
let departamentos = [];
let Departamento = ''; // Variable para almacenar el departamento seleccionado
let todosIdsObjetos = []; // Variable global para almacenar todos los IDs de objetos

// Función para traducir texto al español llamando al servidor
const traducirTexto = async (texto) => {
    // Si el texto es nulo o vacío, devolver el texto original
    if (!texto || typeof texto !== 'string') {
        return texto || ''; // Devuelve el texto original o una cadena vacía
    }

    try {
        const response = await fetch(`/traducir?text=${encodeURIComponent(texto)}`);
        if (!response.ok) {
            throw new Error('Error en la solicitud de traducción');
        }
        const datosTraducidos = await response.json();
        return datosTraducidos.translation;
    } catch (error) {
        console.error('Error al traducir:', error);
        return texto; // Devuelve el texto original si hay un error
    }
};

// Función para cargar los departamentos disponibles en el <select>
const cargarDepartamentos = () => {
    fetch(`${url}/departments`)
        .then(response => response.json())
        .then(datos => {
            departamentos = datos.departments; // Guardar en el array departamentos
            const selectDepartamento = document.getElementById('departamento');
            // Limpiar el select
            selectDepartamento.innerHTML = '';

            // Agregar las opciones de departamentos
            departamentos.forEach(departamento => {
                const opcion = document.createElement('option');
                opcion.value = departamento.departmentId; // Usar el id del departamento
                opcion.textContent = departamento.displayName;
                selectDepartamento.appendChild(opcion);
            });

            // Configurar el evento para cambiar el departamento seleccionado
            selectDepartamento.addEventListener('change', (event) => {
                Departamento = event.target.value; // Guardar el ID del departamento seleccionado
                paginaActual = 1; // Reiniciar la página actual
                buscarObjetos(); // Realizar la búsqueda con el nuevo departamento
            });
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                console.log('Solicitud abortada');
            } else if (error.message.includes('429')) {
                console.log('Límite de peticiones excedido, por favor espera.');
            } else {
                console.error('Error en la solicitud:', error.message);
            }
        });
};

// Función para realizar la búsqueda de objetos
const buscarObjetos = () => {
    const palabraClave = document.getElementById('palabraClave').value;
    const ubicacion = document.getElementById('ubicacion').value;
    let consulta = `${url}/search?departmentId=${Departamento}&hasImages=true`;

    if (palabraClave) consulta += `&q=${encodeURIComponent(palabraClave)}`;
    else consulta += `&q=''`;
    if (ubicacion) consulta += `&geoLocation=${encodeURIComponent(ubicacion)}`;
    console.log('Consulta:', consulta);

    fetch(consulta)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP! Estado: ${response.status}`);
            }
            return response.json();
        })
        .then(datos => {
            // Guardar todos los IDs de objetos en memoria
            todosIdsObjetos = (datos.objectIDs || []).filter(id => id).slice(0, maxElementos);

            // Realizar el fetch de los objetos para la página actual
            cargarObjetosPorPagina();
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                console.log('Solicitud abortada');
            } else if (error.message.includes('429')) {
                console.log('Límite de peticiones excedido, por favor espera.');
            } else {
                console.error('Error en la solicitud:', error.message);
            }
        });
};

// Función para cargar los objetos para la página actual y traducirlos
const cargarObjetosPorPagina = () => {
    // Calcular el rango de objetos a cargar para la página actual
    const indiceInicio = (paginaActual - 1) * elementosPorPagina;
    const indiceFinal = Math.min(indiceInicio + elementosPorPagina, todosIdsObjetos.length);
    const idsPaginados = todosIdsObjetos.slice(indiceInicio, indiceFinal);
    console.log('Ids paginados:', idsPaginados);

    // Array para almacenar los objetos cargados
    const objetosPaginados = [];

    // Función que procesa cada objeto y lo agrega al array
    const procesarObjeto = (id) => {
        return fetch(`${url}/objects/${id}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Estado: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.primaryImage) {
                    objetosPaginados.push(data);
                }
            })
            .catch(error => {
                console.error('Error en la solicitud del objeto:', error.message);
            });
    };

    // Reducir la lista de IDs a promesas usando `map`
    const promesas = idsPaginados.map(id => procesarObjeto(id));

    // Ejecutar todas las promesas en paralelo
    Promise.all(promesas)
        .then(() => {
            // Filtrar objetos duplicados por título
            const titulosVistos = new Set();
            let objetosUnicos = objetosPaginados.filter(objeto => {
                if (titulosVistos.has(objeto.title)) {
                    return false; // Excluir objetos con títulos duplicados
                } else {
                    titulosVistos.add(objeto.title);
                    return true;
                }
            });

            // Si hay menos de 20 objetos únicos, añadir más objetos para completar la página
            if (objetosUnicos.length < elementosPorPagina) {
                // Obtener más IDs que no hayan sido procesados para buscar más objetos
                const idsRestantes = todosIdsObjetos.filter(id => !idsPaginados.includes(id));
                const idsAdicionales = idsRestantes.slice(0, elementosPorPagina - objetosUnicos.length);

                // Procesar los objetos adicionales
                const promesasAdicionales = idsAdicionales.map(id => procesarObjeto(id));

                // Ejecutar todas las promesas adicionales en paralelo
                Promise.all(promesasAdicionales)
                    .then(() => {
                        // Filtrar y añadir objetos únicos adicionales
                        const objetosAdicionales = objetosPaginados.filter(objeto => !titulosVistos.has(objeto.title));
                        objetosUnicos = objetosUnicos.concat(objetosAdicionales);

                        // Traducir los campos título, cultura y dinastía de los objetos
                        traducirObjetos(objetosUnicos);
                    })
                    .catch(error => {
                        console.error('Error al cargar los objetos adicionales:', error.message);
                    });
            } else {
                // Traducir los campos título, cultura y dinastía de los objetos
                traducirObjetos(objetosUnicos);
            }
        })
        .catch(error => {
            console.error('Error al cargar los objetos:', error.message);
        });
};


// Función para traducir los campos de los objetos
const traducirObjetos = async (objetos) => {
    const objetosTraducidos = [];

    for (const objeto of objetos) {
        try {
            const tituloTraducido = await traducirTexto(objeto.title);
            const culturaTraducida = await traducirTexto(objeto.culture);
            const dinastiaTraducida = await traducirTexto(objeto.dynasty);

            objetosTraducidos.push({
                ...objeto,
                title: tituloTraducido || objeto.title,
                culture: culturaTraducida || objeto.culture,
                dynasty: dinastiaTraducida || objeto.dynasty
            });
        } catch (error) {
            console.error('Error en la traducción:', error);
            objetosTraducidos.push(objeto); // Incluye el objeto sin traducir en caso de error
        }
    }

    // Mostrar los objetos una vez que todos se han traducido
    mostrarObjetos(objetosTraducidos);
    configurarPaginacion(todosIdsObjetos.length);
};


// Función para mostrar los objetos
const mostrarObjetos = (objetos) => {
    const galeria = document.getElementById('galeria');
    galeria.innerHTML = '';

    objetos.forEach(objeto => {
        // Imprimir el ID del objeto en la consola
        console.log(`ID del objeto: ${objeto.objectID}, Departamento: ${objeto.department}`);

        const tarjeta = document.createElement('div');
        tarjeta.className = 'tarjeta';

        const imagenPrincipal = objeto.primaryImage || 'default_image.jpg';
        const titulo = objeto.title || 'Título no disponible';
        const cultura = objeto.culture || 'Cultura no disponible';
        const dinastia = objeto.dynasty || 'Dinastía no disponible';
        const fecha = objeto.objectDate || 'Fecha no disponible';

        // Construcción del carrusel
        let imagenes = [imagenPrincipal];
        if (objeto.additionalImages && objeto.additionalImages.length > 0) {
            imagenes = imagenes.concat(objeto.additionalImages);
        }

        const carrusel = `
            <div class="carousel-container">
                <div class="carousel-images">
                    ${imagenes.map(img => `<img src="${img}" alt="Imagen adicional">`).join('')}
                </div>
                ${imagenes.length > 1 ? `
                    <button class="carousel-button prev">Anterior</button>
                    <button class="carousel-button next">Siguiente</button>
                ` : ''}
            </div>
        `;

        tarjeta.innerHTML = `
            ${carrusel}
            <div class="contenido-tarjeta">
                <h3>${titulo}</h3>
                <p><strong>Cultura:</strong> ${cultura}</p>
                <p><strong>Dinastía:</strong> ${dinastia}</p>
                <p><strong>Fecha:</strong> ${fecha}</p>
            </div>
            <div class="fecha">${fecha}</div>
        `;

        galeria.appendChild(tarjeta);
    });

    // Inicializar los botones del carrusel
    document.querySelectorAll('.carousel-container').forEach(container => {
        const images = container.querySelectorAll('.carousel-images img');
        const prevButton = container.querySelector('.carousel-button.prev');
        const nextButton = container.querySelector('.carousel-button.next');
        let currentIndex = 0;

        const updateCarousel = () => {
            const offset = -currentIndex * 100;
            container.querySelector('.carousel-images').style.transform = `translateX(${offset}%)`;
        };

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                currentIndex = (currentIndex - 1 + images.length) % images.length;
                updateCarousel();
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                currentIndex = (currentIndex + 1) % images.length;
                updateCarousel();
            });
        }
    });
};

// Función para configurar los botones de paginación
const configurarPaginacion = (totalElementos) => {
    const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
    const paginacionDiv = document.getElementById('paginacion');
    paginacionDiv.innerHTML = '';

    for (let i = 1; i <= totalPaginas; i++) {
        const boton = document.createElement('button');
        boton.textContent = i;
        boton.disabled = (i === paginaActual);

        boton.addEventListener('click', () => {
            paginaActual = i;
            cargarObjetosPorPagina();
        });

        paginacionDiv.appendChild(boton);
    }
};

// Inicializar la carga de departamentos al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    cargarDepartamentos();

    // Configurar el botón de búsqueda
    const btnBuscar = document.getElementById('buscar');
    btnBuscar.addEventListener('click', () => {
        paginaActual = 1;
        buscarObjetos();
    });
});
