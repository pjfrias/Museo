const url = 'https://collectionapi.metmuseum.org/public/collection/v1';
const maxElementos = 400; // Límite de elementos
const elementosPorPagina = 20; // Elementos por página
let paginaActual = 1;
let departamentos = [];
let Departamento = ''; // Variable para almacenar el departamento seleccionado
let todosIdsObjetos = []; // Variable global para almacenar todos los IDs de objetos
let idsPorPagina = {}; // Variable global para almacenar IDs asignados a cada página

// Función para traducir texto al español llamando al servidor
const traducirTexto = async (texto) => {
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

// Inicializar la carga de departamentos al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    cargarDepartamentos();

    // Configurar el botón de búsqueda
    const btnBuscar = document.getElementById('buscar');
    btnBuscar.addEventListener('click', () => {
        paginaActual = 1;
        mostrarLoader(); // Mostrar la animación de carga
        buscarObjetos();
    });

    // Agregar event listener para detectar la tecla "Enter"
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // Simular un clic en el botón de búsqueda
            btnBuscar.click();
        }
    });
});

// Mostrar el loader
const mostrarLoader = () => {
    const loader = document.getElementById('loader');
    loader.style.display = 'block';
};

// Ocultar el loader
const ocultarLoader = () => {
    const loader = document.getElementById('loader');
    loader.style.display = 'none';
};

// Función para cargar los departamentos disponibles en el <select>
const cargarDepartamentos = () => {
    fetch(`${url}/departments`)
        .then(response => response.json())
        .then(datos => {
            departamentos = datos.departments;
            const selectDepartamento = document.getElementById('departamento');
            selectDepartamento.innerHTML = '';

            departamentos.forEach(departamento => {
                const opcion = document.createElement('option');
                opcion.value = departamento.departmentId;
                opcion.textContent = departamento.displayName;
                selectDepartamento.appendChild(opcion);
            });

            selectDepartamento.addEventListener('change', (event) => {
                Departamento = event.target.value;
                paginaActual = 1;
                idsPorPagina = {}; // Resetear al cambiar de departamento
                mostrarLoader(); // Mostrar la animación de carga al cambiar de departamento
                buscarObjetos();
            });
        })
        .catch(error => {
            console.error('Error en la solicitud:', error.message);
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
            filtrarYAsignarObjetosAPaginas(); // Filtrar y asignar los objetos a las páginas
        })
        .catch(error => {
            console.error('Error en la solicitud:', error.message);
            ocultarLoader(); // Ocultar el loader si hay un error
        });
};

// Función para filtrar los objetos y asignarles números de página
const filtrarYAsignarObjetosAPaginas = () => {
    let objetosFiltrados = [];
    let idsAsignados = new Set(); // Para rastrear IDs únicos

    // Procesar los IDs para filtrar duplicados por título
    const promesas = todosIdsObjetos.map(id => procesarObjeto(id));

    Promise.all(promesas)
        .then(resultados => {
            // Filtrar resultados únicos por título
            resultados.forEach(data => {
                if (data && data.primaryImage && !idsAsignados.has(data.objectID) && !objetosFiltrados.some(obj => obj.title === data.title)) {
                    objetosFiltrados.push(data);
                    idsAsignados.add(data.objectID);
                }
            });

            // Asignar IDs a las páginas
            let pagina = 1;
            let contadorObjetos = 0;
            objetosFiltrados.forEach((objeto) => {
                if (!idsPorPagina[pagina]) {
                    idsPorPagina[pagina] = [];
                }

                // Asignar ID al número de página
                idsPorPagina[pagina].push(objeto.objectID);
                contadorObjetos++;

                // Avanzar a la siguiente página después de llenar 20 elementos
                if (contadorObjetos === elementosPorPagina) {
                    pagina++;
                    contadorObjetos = 0;
                }
            });

            console.log('IDs asignados a páginas:', idsPorPagina);
            cargarObjetosPorPagina(); // Cargar la primera página
        })
        .catch(error => {
            console.error('Error al procesar los objetos:', error.message);
            ocultarLoader(); // Ocultar el loader si hay un error
        });
};

// Función para cargar los objetos para la página actual y traducirlos
const cargarObjetosPorPagina = () => {
    let objetosUnicos = [];
    let idsBloque = idsPorPagina[paginaActual] || [];

    // Procesar el bloque de IDs asignados a la página actual
    const promesas = idsBloque.map(id => procesarObjeto(id));

    Promise.all(promesas)
        .then(resultados => {
            // Filtrar resultados únicos por título
            resultados.forEach(data => {
                if (data && data.primaryImage && !objetosUnicos.some(obj => obj.title === data.title)) {
                    objetosUnicos.push(data);
                }
            });

            console.log('Objetos únicos antes de traducir:', objetosUnicos);
            traducirObjetos(objetosUnicos.slice(0, elementosPorPagina));
        })
        .catch(error => {
            console.error('Error al cargar el bloque de objetos:', error.message);
            ocultarLoader(); // Ocultar el loader si hay un error
        });
};

// Función que procesa cada objeto
const procesarObjeto = (id) => {
    return fetch(`${url}/objects/${id}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error HTTP! Estado: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
            console.error('Error en la solicitud del objeto:', error.message);
            return null; // Devolver null en caso de error
        });
};

// Función para traducir los campos de los objetos
const traducirObjetos = async (objetos) => {
    console.log('Objetos a traducir:', objetos);
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
            objetosTraducidos.push(objeto);
        }
    }

    // Mostrar los objetos una vez que todos se han traducido
    mostrarObjetos(objetosTraducidos);

    // Configurar la paginación después de mostrar los objetos
    configurarPaginacion(Object.keys(idsPorPagina).length);
};

// Función para mostrar los objetos
const mostrarObjetos = (objetos) => {
    const galeria = document.getElementById('galeria');
    galeria.innerHTML = '';

    objetos.forEach(objeto => {
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

    // Ocultar la animación de carga después de que las imágenes se hayan cargado
    ocultarLoader();

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
const configurarPaginacion = (totalPaginas) => {
    const paginacionDiv = document.getElementById('paginacion');
    paginacionDiv.innerHTML = '';

    // Crear los botones de paginación
    for (let i = 1; i <= totalPaginas; i++) {
        const boton = document.createElement('button');
        boton.textContent = i;
        boton.disabled = (i === paginaActual);

        boton.addEventListener('click', () => {
            paginaActual = i;
            mostrarLoader(); // Mostrar la animación de carga al cambiar de página
            cargarObjetosPorPagina(); // Cargar los objetos para la página seleccionada
        });

        paginacionDiv.appendChild(boton);
    }
};
