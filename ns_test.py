def a():
    return b()

def b():
    return 1

results = a()
print("NS_TEST_OK", results)
