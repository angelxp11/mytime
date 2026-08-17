valor_hora_base = 9285

recargo_nocturno = 0.30
recargo_dominical = 0.5454


def pedir_tiempo():
    horas = int(input("Ingrese horas: "))
    minutos = int(input("Ingrese minutos: "))

    if horas < 0:
        print("Las horas no pueden ser negativas.")
        return pedir_tiempo()

    if minutos < 0 or minutos >= 60:
        print("Los minutos deben estar entre 0 y 59.")
        return pedir_tiempo()

    total_horas = horas + (minutos / 60)

    return horas, minutos, total_horas


while True:

    print("\n==============================")
    print("       CALCULADORA BUK")
    print("==============================")
    print("1. Horas ordinarias")
    print("2. Recargos nocturnos")
    print("3. Horas dominicales")
    print("4. Calcular cualquier recargo")
    print("0. Salir")
    print("==============================")

    opcion = input("Seleccione una opción: ")

    # ==========================================
    # 1. HORAS ORDINARIAS
    # ==========================================

    if opcion == "1":

        horas = float(
            input("Ingrese horas: ").replace(",", ".")
        )

        total = horas * valor_hora_base

        print("\n------------------------------")
        print("SALARIO POR HORAS")
        print("------------------------------")
        print(f"Horas: {horas}")
        print(f"Valor hora: ${valor_hora_base:,.0f}")
        print(f"Total: ${total:,.0f}")


    # ==========================================
    # 2. RECARGO NOCTURNO
    # ==========================================

    elif opcion == "2":

        horas, minutos, total_horas = pedir_tiempo()

        valor_hora_nocturna = (
            valor_hora_base * (1 + recargo_nocturno)
        )

        valor_recargo_hora = (
            valor_hora_nocturna - valor_hora_base
        )

        total_recargo = (
            total_horas * valor_recargo_hora
        )

        print("\n------------------------------")
        print("RECARGO NOCTURNO")
        print("------------------------------")
        print(f"Horas: {horas} h {minutos} min")
        print(f"Recargo: {recargo_nocturno * 100:.2f}%")
        print(
            f"Recargo por hora: "
            f"${valor_recargo_hora:,.0f}"
        )
        print(
            f"Total recargo: "
            f"${total_recargo:,.0f}"
        )


    # ==========================================
    # 3. HORAS DOMINICALES
    # ==========================================

    elif opcion == "3":

        horas, minutos, total_horas = pedir_tiempo()

        valor_hora_dominical = (
            valor_hora_base *
            (1 + recargo_dominical)
        )

        total_dominical = (
            total_horas * valor_hora_dominical
        )

        print("\n------------------------------")
        print("RECARGO DOMINICAL")
        print("------------------------------")
        print(f"Horas: {horas} h {minutos} min")
        print(f"Recargo: {recargo_dominical * 100:.2f}%")
        print(
            f"Valor hora dominical: "
            f"${valor_hora_dominical:,.0f}"
        )
        print(
            f"Total: "
            f"${total_dominical:,.0f}"
        )


    # ==========================================
    # 4. CALCULAR CUALQUIER RECARGO
    # ==========================================

    elif opcion == "4":

        print("\n------------------------------")
        print("CALCULAR CUALQUIER RECARGO")
        print("------------------------------")

        horas, minutos, total_horas = pedir_tiempo()

        valor_pagado = float(
            input("Ingrese el valor que le pagaron: $")
            .replace(".", "")
            .replace(",", ".")
        )

        # Valor que correspondería solamente
        # por horas ordinarias
        valor_ordinario = (
            total_horas * valor_hora_base
        )

        # Diferencia entre lo pagado
        # y el valor ordinario
        valor_recargo = (
            valor_pagado - valor_ordinario
        )

        # Porcentaje de recargo
        porcentaje = (
            valor_recargo / valor_ordinario
        ) * 100

        print("\n------------------------------")
        print("RESULTADO")
        print("------------------------------")

        print(
            f"Tiempo: {horas} h {minutos} min"
        )

        print(
            f"Valor ordinario: "
            f"${valor_ordinario:,.0f}"
        )

        print(
            f"Valor pagado: "
            f"${valor_pagado:,.0f}"
        )

        print(
            f"Valor del recargo: "
            f"${valor_recargo:,.0f}"
        )

        print(
            f"Recargo correspondiente: "
            f"{porcentaje:.2f}%"
        )


    # ==========================================
    # 0. SALIR
    # ==========================================

    elif opcion == "0":

        print("\nPrograma finalizado.")
        break


    else:

        print("\n❌ Opción no válida.")