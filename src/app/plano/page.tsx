"use client";
import React, { use, useEffect, useState } from "react";
import { Stage, Layer, Rect, Circle, Text } from 'react-konva'
export default function Plano() {
    const [windowSize, setWindowSize] = useState({ width: 500, height: 500 })
    const [rectPosicion, setRectPosicion] = useState({ x: 20, y: 50 });
    const [cirPosicion, setCirPosicion] = useState({ x: 200, y: 100 })
    useEffect(() => {
        const actualizarTamaño = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight
            })
        }
        actualizarTamaño();

    }, [])
    return (
        <div className=" flex items-center justify-center">
            <h1>AQUI ESTARA EL PLANO</h1>
            <Stage width={windowSize.width} height={windowSize.height} className="m-5 border-2 border-amber-300">
                <Layer>
                    <Text text="ESTE ES EL EJEMPLO" fontSize={15} />
                    <Text text={`ESTE ES X: ${rectPosicion.x} Y ESTE ES Y: ${rectPosicion.y}`} x={20} y={20} />
                    <Rect
                        x={rectPosicion.x}
                        y={rectPosicion.y}
                        width={100}
                        height={100}
                        fill="red"
                        shadowBlur={10}
                        draggable
                        dragBoundFunc={(pos) => ({
                            x: Math.max(
                                0, Math.min(pos.x, windowSize.width - 100)
                            ),
                            y: Math.max(
                                0, Math.min(pos.y, windowSize.height - 100)
                            )
                        })}
                        onDragEnd={(e) => setRectPosicion(e.target.position())}
                        onDragMove={(e) => setRectPosicion(e.target.position())}
                    />
                    <Circle x={cirPosicion.x}
                        y={cirPosicion.y}
                        radius={50}
                        fill="blue"
                        draggable
                        onDragEnd={(e) => setCirPosicion(e.target.position())}></Circle>
                </Layer>
                <Layer>
                    <Rect
                        x={rectPosicion.x}
                        y={rectPosicion.y}
                        width={150}
                        height={150}
                        fill="yellow"
                    //draggable
                    //onDragEnd={(e) => setRectPosicion(e.target.position())} 
                    />
                </Layer>
            </Stage>
        </div>
    )
}