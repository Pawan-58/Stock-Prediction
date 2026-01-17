import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split

#randome array of 10 
data = np.random.rand(10, 1) * 100
print(f"Original data:\n{data[0:2]}")
