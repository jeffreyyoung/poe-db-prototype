import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@2d4f50ccf9af40b05ddad4f76a444935213859a2/replicache.js"

const rep = new Replicache({
    pushDelay: 100,
    pullDelay: 100,
    mutators: {
        addPointToStroke: async (tx, { strokeID, point, color }) => {
            const stroke = (await tx.get(`strokes/${strokeID}`)) || { points: [], color }
            await tx.set(`strokes/${strokeID}`, { ...stroke, color, points: [...stroke.points, point] })
        },
        updateCursor: async (tx, { x, y, color, name, updatedAt }) => {
            await tx.set(`cursors/${tx.clientID}`, { x, y, clientID: tx.clientID, color, name, updatedAt })
        },
        deleteCursor: async (tx, { cursorKey }) => {
            await tx.del(cursorKey)
        },
        clearCanvas: async (tx) => {
            const entries = await tx.scan({ prefix: "strokes/" }).entries().toArray()
            for (const [key] of entries) {
                await tx.del(key)
            }
        }
    }
})

const canvas = document.getElementById('drawingCanvas')
const ctx = canvas.getContext('2d')
const colorPicker = document.getElementById('colorPicker')
const clearButton = document.getElementById('clearCanvas')
const closeButton = document.getElementById('closePanel')
const drawingContainer = document.querySelector('.drawing-container')

let isDrawing = false
let currentStrokeID = null
let lastPoint = null

// Drawing functions
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect()
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    }
}

function drawPoint(point, color) {
    ctx.beginPath()
    ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
}

function drawLine(start, end, color) {
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
}

// Event listeners
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true
    currentStrokeID = Date.now().toString()
    const point = getMousePos(canvas, e)
    lastPoint = point
    drawPoint(point, colorPicker.value)
    rep.mutate.addPointToStroke({
        strokeID: currentStrokeID,
        point,
        color: colorPicker.value
    })
})

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return
    
    const point = getMousePos(canvas, e)
    drawLine(lastPoint, point, colorPicker.value)
    lastPoint = point
    
    rep.mutate.addPointToStroke({
        strokeID: currentStrokeID,
        point,
        color: colorPicker.value
    })

    // Update cursor position
    rep.mutate.updateCursor({
        x: point.x,
        y: point.y,
        color: colorPicker.value,
        name: 'User',
        updatedAt: Date.now()
    })
})

canvas.addEventListener('mouseup', () => {
    isDrawing = false
    currentStrokeID = null
    lastPoint = null
})

canvas.addEventListener('mouseleave', () => {
    isDrawing = false
    currentStrokeID = null
    lastPoint = null
})

clearButton.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    rep.mutate.clearCanvas()
})

// Handle close button
closeButton.addEventListener('click', () => {
    drawingContainer.classList.add('hidden')
})

// Subscribe to strokes
rep.subscribeToScanEntries("strokes/", (entries, changes) => {
    for (const [key, value] of changes.added) {
        // Draw the entire stroke
        const points = value.points
        if (points.length > 0) {
            drawPoint(points[0], value.color)
            for (let i = 1; i < points.length; i++) {
                drawLine(points[i-1], points[i], value.color)
            }
        }
    }
})

// Subscribe to cursors
rep.subscribeToScanEntries("cursors/", (entries, changes) => {
    for (const [key, value] of changes.added) {
        const cursor = document.createElement('div')
        cursor.className = 'cursor'
        cursor.style.backgroundColor = value.color
        cursor.style.left = `${value.x}px`
        cursor.style.top = `${value.y}px`
        cursor.id = `cursor-${value.clientID}`
        document.body.appendChild(cursor)
    }
    
    for (const [key, value] of changes.changed) {
        const cursor = document.getElementById(`cursor-${value.clientID}`)
        if (cursor) {
            cursor.style.left = `${value.x}px`
            cursor.style.top = `${value.y}px`
        }
    }
    
    for (const [key] of changes.removed) {
        const cursor = document.getElementById(`cursor-${key.split('/')[1]}`)
        if (cursor) {
            cursor.remove()
        }
    }
})

// Clean up inactive cursors
async function removeInactiveCursors() {
    const keysToDelete = await rep.query(async (tx) => {
        const entries = await tx.scan({ prefix: "cursors/" }).entries().toArray()
        const keysToDelete = []
        for (const [key, value] of entries) {
            if (Date.now() - value.updatedAt > 5000) {
                keysToDelete.push(key)
            }
        }
        return keysToDelete
    })
    
    for (const cursorKey of keysToDelete) {
        await rep.mutate.deleteCursor({ cursorKey })
    }
}

setInterval(removeInactiveCursors, 1000) 